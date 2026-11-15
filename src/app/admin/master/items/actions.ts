'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import {
  dateRangeFilter,
  deletedWhere,
  idFilter,
  statusWhere,
  ynFilter,
} from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { effectiveItemOptions, itemCreateSchema, itemSchema } from '@/lib/items/item-schema'
import {
  createItem,
  deleteItems,
  restoreItems,
  setItemsActive,
  updateItem,
} from '@/lib/items/items'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { DELETED_ONLY, withIsActive } from '@/lib/status'
import { isYes } from '@/lib/yn'

// 품목 서버 액션 (docs/decisions/0041)
// 데이터 범위: 운영사 관리자 = 운영사 전체, 센터 직원 = 소속 센터를 이용하는 화주사의 품목, 화주사 사용자 = 자기 화주사
// 화주사(운영사 전용)와 달리 범위 안이면 센터 직원도 품목을 대신 등록·수정할 수 있다 (ASN 대리 등록과 같은 이유)

const ITEM_SCOPE = { center: 'shipper.centers.some.centerId', shipper: 'shipperId' }
const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }

const idsSchema = z.array(idSchema).min(1).max(500)

// 고른 품목이 모두 범위 안에 있어야 한다 (하나라도 밖·없음이면 전체 거부). deleted: 지운 품목 중에서
async function assertItemsInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const unique = [...new Set(ids)]
  const count = await prisma.item.count({
    where: {
      AND: [{ id: { in: unique } }, scopeFilter(scope, ITEM_SCOPE), deleted ? DELETED_ONLY : {}],
    },
  })
  if (count !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 품목이 섞여 있습니다.')
  }
  return unique
}

// 숫자(Decimal) → 보기 좋은 글자 ('24.000' → '24', '2.500' → '2.5')
const qtyText = (value: { toString(): string }) => Number(value.toString()).toLocaleString('ko-KR')

// 목록 (검색 조건: 품목 목록 화면의 searchFields와 같은 키 — keyword·shipper·status·lot·expiry·createdAt)
export const listItemsAction = createAction({
  permission: 'master.items.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.items.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'systemCode', 'name', 'barcode', 'shipper.name', 'shipper.code'],
      sortable: {
        code: 'code',
        name: 'name',
        shipper: 'shipper.code',
        isActive: 'status',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    // 로트·유통기한 거르기는 "실제로 적용되는 값" 기준 (품목이 비어 있으면 화주사 기본값)
    const optionWhere = (key: 'useLot' | 'useExpiry', value: 'Y' | 'N' | undefined) =>
      value === undefined
        ? {}
        : { OR: [{ [key]: value }, { [key]: null, shipper: { [key]: value } }] }
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, ITEM_SCOPE),
        idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
        statusWhere(filters),
        deletedWhere(filters),
        optionWhere('useLot', ynFilter(filters, 'lot')),
        optionWhere('useExpiry', ynFilter(filters, 'expiry')),
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.item.findMany({
        ...query,
        where,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          spec: true,
          barcode: true,
          useLot: true,
          useExpiry: true,
          labelUnit: true,
          expiryAlertDays: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          shipper: {
            select: { code: true, name: true, useLot: true, useExpiry: true, labelUnit: true },
          },
          baseUnit: { select: { code: true } },
          units: {
            select: { convQty: true, unit: { select: { code: true } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      prisma.item.count({ where }),
    ])
    return {
      rows: rows.map(withIsActive).map(({ shipper, baseUnit, units, ...row }) => {
        const options = effectiveItemOptions(
          {
            useLot: row.useLot as 'Y' | 'N' | null,
            useExpiry: row.useExpiry as 'Y' | 'N' | null,
            labelUnit: row.labelUnit,
          },
          {
            useLot: isYes(shipper.useLot),
            useExpiry: isYes(shipper.useExpiry),
            labelUnit: shipper.labelUnit,
          },
        )
        return {
          id: row.id,
          systemCode: row.systemCode,
          code: row.code,
          name: row.name,
          spec: row.spec,
          barcode: row.barcode,
          shipper: `${shipper.name} (${shipper.code})`,
          baseUnit: baseUnit.code,
          // 환산단위 요약: 'BOX 24 · PLT 1,440'
          units: units.map((u) => `${u.unit.code} ${qtyText(u.convQty)}`).join(' · ') || null,
          useLot: options.useLot,
          useExpiry: options.useExpiry,
          labelUnit: options.labelUnit,
          // 라벨 단위의 입수량이 없으면 라벨을 발행할 수 없다 (저장은 허용, 목록에 표시 — 사용자 결정)
          labelUnitMissing: !units.some((u) => u.unit.code === options.labelUnit),
          expiryAlertDays: row.expiryAlertDays,
          isActive: row.isActive,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      }),
      rowCount,
    }
  },
})

// 등록: 고른 화주사가 범위 안이어야 한다
export const createItemAction = createAction({
  permission: 'master.items.create',
  input: itemCreateSchema,
  handler: async ({ input, scope }) => {
    const shipper = await prisma.shipper.findUnique({
      where: { id: input.shipperId },
      select: { id: true, operatorId: true, centers: { select: { centerId: true } } },
    })
    assertInScope(scope, shipper, SHIPPER_SCOPE)
    return createItem(input)
  },
})

// 수정 (rowVersion: 화면이 불러온 버전, 동시 수정 막기)
export const updateItemAction = createAction({
  permission: 'master.items.update',
  input: itemSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await assertItemsInScope([id], scope)
    return updateItem(id, rowVersion, data)
  },
})

// 사용 중지 / 다시 사용 (한 건·여러 건 공용)
export const setItemsActiveAction = createAction({
  permission: 'master.items.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) =>
    setItemsActive(await assertItemsInScope(input.ids, scope), input.isActive),
})

// 지우기 (쓰인 적 없는 품목만, 되살릴 수 있다)
export const deleteItemsAction = createAction({
  permission: 'master.items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => deleteItems(await assertItemsInScope(input.ids, scope)),
})

// 되살리기 (지운 품목 중에서, 권한은 삭제와 같다)
export const restoreItemsAction = createAction({
  permission: 'master.items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    restoreItems(await assertItemsInScope(input.ids, scope, true)),
})
