'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { customerItemSchema } from '@/lib/customer-items/customer-item-schema'
import {
  commitCustomerItemUpload,
  previewCustomerItemUpload,
} from '@/lib/customer-items/customer-item-upload'
import {
  assertCustomerItemsInScope,
  createCustomerItem,
  CUSTOMER_ITEM_SCOPE,
  deleteCustomerItems,
  getCustomerItemOptions,
  restoreCustomerItems,
  setCustomerItemsActive,
  updateCustomerItem,
} from '@/lib/customer-items/customer-items'
import { uploadRowsSchema } from '@/lib/excel/upload'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { deletedWhere, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { scopeFilter } from '@/lib/scope/data-scope'
import { qtyText, parseQty } from '@/lib/units/convert'

// 거래처별 품목코드 서버 액션 (docs/decisions/0098) — 권한 master.customer-items.*, 범위는 거래처와 같다

const idsSchema = z.array(idSchema).min(1).max(500)

// 목록 (검색 조건: 화면 searchFields와 같은 키 — shipper·customer·status, 검색어는 거래처 품목코드·품목)
export const listCustomerItemsAction = createAction({
  permission: 'master.customer-items.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.customer-items.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: [
        'custItemCode',
        'custItemName',
        'custBarcode',
        'item.code',
        'item.name',
        'customer.code',
        'customer.name',
      ],
      sortable: {
        customer: 'customer.code',
        itemCode: 'item.code',
        custItemCode: 'custItemCode',
        status: 'status',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { id: 'asc' },
    })
    const shipper = idFilter(filters, 'shipper')
    const customer = idFilter(filters, 'customer')
    const where = {
      AND: [
        scopeFilter(scope, CUSTOMER_ITEM_SCOPE),
        query.where,
        shipper ? { shipperId: shipper } : {},
        customer ? { customerId: customer } : {},
        statusWhere(filters),
        deletedWhere(filters),
      ],
    }
    // 정렬을 고르지 않으면 거래처 → 품목 순
    const orderBy =
      input.sorting.length === 0
        ? [{ customer: { code: 'asc' as const } }, { item: { code: 'asc' as const } }]
        : query.orderBy
    const [rows, rowCount] = await prisma.$transaction([
      prisma.customerItem.findMany({
        ...query,
        orderBy,
        where,
        select: {
          id: true,
          shipperId: true,
          customerId: true,
          itemId: true,
          custItemCode: true,
          custItemName: true,
          custBarcode: true,
          deliveryUnitId: true,
          minShelfDays: true,
          minShelfRatio: true,
          remark: true,
          status: true,
          rowVersion: true,
          updatedAt: true,
          updatedBy: true,
          shipper: { select: { name: true } },
          customer: { select: { code: true, name: true } },
          item: { select: { code: true, name: true } },
          deliveryUnit: { select: { code: true } },
        },
      }),
      prisma.customerItem.count({ where }),
    ])
    return {
      rows: rows.map((row) => ({
        id: row.id,
        shipperId: row.shipperId,
        shipperName: row.shipper.name,
        customerId: row.customerId,
        customer: `${row.customer.name} (${row.customer.code})`,
        itemId: row.itemId,
        itemCode: row.item.code,
        itemName: row.item.name,
        custItemCode: row.custItemCode,
        custItemName: row.custItemName,
        custBarcode: row.custBarcode,
        deliveryUnitId: row.deliveryUnitId,
        deliveryUnit: row.deliveryUnit?.code ?? null,
        minShelfDays: row.minShelfDays,
        minShelfRatio:
          row.minShelfRatio === null ? null : qtyText(parseQty(row.minShelfRatio.toString())),
        remark: row.remark,
        status: row.status,
        rowVersion: row.rowVersion,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      })),
      rowCount,
    }
  },
})

// 팝업 선택지: 그 화주사의 거래처(매출처·둘 다)·품목(단위 포함)
export const getCustomerItemOptionsAction = createAction({
  permission: 'master.customer-items.read',
  input: z.object({ shipperId: idSchema }),
  handler: ({ input, scope }) => getCustomerItemOptions(input.shipperId, scope),
})

export const createCustomerItemAction = createAction({
  permission: 'master.customer-items.create',
  input: customerItemSchema,
  handler: ({ input, scope }) => createCustomerItem(input, scope),
})

export const updateCustomerItemAction = createAction({
  permission: 'master.customer-items.update',
  input: customerItemSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: ({ input: { id, rowVersion, ...data }, scope }) =>
    updateCustomerItem(id, rowVersion, data, scope),
})

export const setCustomerItemsActiveAction = createAction({
  permission: 'master.customer-items.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) =>
    setCustomerItemsActive(
      await assertCustomerItemsInScope([...new Set(input.ids)], scope),
      input.isActive,
    ),
})

export const deleteCustomerItemsAction = createAction({
  permission: 'master.customer-items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    deleteCustomerItems(await assertCustomerItemsInScope([...new Set(input.ids)], scope)),
})

export const restoreCustomerItemsAction = createAction({
  permission: 'master.customer-items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    restoreCustomerItems(await assertCustomerItemsInScope([...new Set(input.ids)], scope, true)),
})

// 엑셀 업로드: 새 줄 등록 + 있는 줄 수정이라 등록·수정 권한 둘 다
const assertUploadPermission = (permissions: ReadonlySet<string>) => {
  if (!permissions.has('master.customer-items.update')) {
    throw new ActionError('FORBIDDEN', '거래처 품목코드 수정 권한이 없습니다.')
  }
}

export const validateCustomerItemUploadAction = createAction({
  permission: 'master.customer-items.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope, permissions }) => {
    assertUploadPermission(permissions)
    return previewCustomerItemUpload(input, scope)
  },
})

export const commitCustomerItemUploadAction = createAction({
  permission: 'master.customer-items.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope, permissions }) => {
    assertUploadPermission(permissions)
    return commitCustomerItemUpload(input, scope)
  },
})
