'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { contractSchema } from '@/lib/carriers/contract-schema'
import {
  assertContractsInScope,
  createContract,
  deleteContracts,
  restoreContracts,
  setContractsActive,
  updateContract,
} from '@/lib/carriers/contracts'
import { remainingInvoices } from '@/lib/carriers/invoice-no'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { deletedWhere, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { scopeFilter } from '@/lib/scope/data-scope'
import { isYes } from '@/lib/yn'

// 운송 계약 서버 액션 (docs/decisions/0094) — 권한 master.carrier-contracts.*, 센터 직원은 소속 센터만

const idsSchema = z.array(idSchema).min(1).max(200)

// 목록 (검색 조건: 운송 계약 목록 화면의 searchFields와 같은 키 — center·shipper·carrier·status)
export const listContractsAction = createAction({
  permission: 'master.carrier-contracts.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.carrier-contracts.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['custNo', 'pickupBranch'],
      sortable: {
        custNo: 'custNo',
        validTo: 'validTo',
        status: 'status',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { id: 'asc' },
    })
    const center = idFilter(filters, 'center')
    const carrier = idFilter(filters, 'carrier')
    // 화주 조건: 'COMMON' = 센터 공용 계약만
    const shipper =
      filters.shipper === 'COMMON' ? null : (idFilter(filters, 'shipper') ?? undefined)
    const where = {
      AND: [
        scopeFilter(scope, { center: 'centerId' }),
        query.where,
        center ? { centerId: center } : {},
        carrier ? { carrierId: carrier } : {},
        shipper !== undefined ? { shipperId: shipper } : {},
        statusWhere(filters),
        deletedWhere(filters),
      ],
    }
    // 정렬을 고르지 않으면 센터 → 화주(공용 먼저) → 운송사 순
    const orderBy =
      input.sorting.length === 0
        ? [
            { center: { sortOrder: 'asc' as const } },
            { shipperId: { sort: 'asc' as const, nulls: 'first' as const } },
            { carrier: { sortOrder: 'asc' as const } },
          ]
        : query.orderBy
    const [rows, rowCount] = await prisma.$transaction([
      prisma.carrierContract.findMany({
        ...query,
        orderBy,
        where,
        select: {
          id: true,
          custNo: true,
          pickupBranch: true,
          invoiceStart: true,
          invoiceEnd: true,
          invoiceNext: true,
          defaultYn: true,
          validFrom: true,
          validTo: true,
          status: true,
          updatedAt: true,
          carrier: { select: { code: true, name: true } },
          center: { select: { code: true, name: true } },
          shipper: { select: { code: true, name: true } },
        },
      }),
      prisma.carrierContract.count({ where }),
    ])
    return {
      rows: rows.map((row) => ({
        id: row.id,
        carrierName: row.carrier.name,
        centerName: row.center.name,
        shipperName: row.shipper?.name ?? null,
        custNo: row.custNo,
        pickupBranch: row.pickupBranch,
        invoiceRange:
          row.invoiceStart && row.invoiceEnd ? `${row.invoiceStart} ~ ${row.invoiceEnd}` : null,
        invoiceNext: row.invoiceNext,
        remaining:
          row.invoiceNext && row.invoiceEnd
            ? remainingInvoices({ next: row.invoiceNext, end: row.invoiceEnd })
            : null,
        isDefault: isYes(row.defaultYn),
        validFrom: row.validFrom,
        validTo: row.validTo,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
      rowCount,
    }
  },
})

export const createContractAction = createAction({
  permission: 'master.carrier-contracts.create',
  input: contractSchema,
  handler: ({ input, scope }) => createContract(input, scope),
})

export const updateContractAction = createAction({
  permission: 'master.carrier-contracts.update',
  input: contractSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: ({ input: { id, rowVersion, ...data }, scope }) =>
    updateContract(id, rowVersion, data, scope),
})

export const setContractsActiveAction = createAction({
  permission: 'master.carrier-contracts.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) =>
    setContractsActive(
      await assertContractsInScope([...new Set(input.ids)], scope),
      input.isActive,
    ),
})

export const deleteContractsAction = createAction({
  permission: 'master.carrier-contracts.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    deleteContracts(await assertContractsInScope([...new Set(input.ids)], scope)),
})

export const restoreContractsAction = createAction({
  permission: 'master.carrier-contracts.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    restoreContracts(await assertContractsInScope([...new Set(input.ids)], scope, true)),
})
