'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { CARRIER_TYPE } from '@/lib/carriers/carrier-codes'
import { carrierCreateSchema, carrierSchema } from '@/lib/carriers/carrier-schema'
import {
  createCarrier,
  deleteCarriers,
  restoreCarriers,
  setCarriersActive,
  updateCarrier,
} from '@/lib/carriers/carriers'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, deletedWhere, statusWhere } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { operatorFilter } from '@/lib/scope/data-scope'

// 운송사 서버 액션 (docs/decisions/0094) — 권한 master.carriers.*, 데이터 범위는 운영사 전체

const idsSchema = z.array(idSchema).min(1).max(200)

// 목록 (검색 조건: 운송사 목록 화면의 searchFields와 같은 키 — type·status)
export const listCarriersAction = createAction({
  permission: 'master.carriers.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) => {
    if (input.exportAll) throw new ActionError('FORBIDDEN', '엑셀 내려받기를 지원하지 않습니다.')
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'custCode', 'name'],
      sortable: {
        code: 'code',
        name: 'name',
        carrierType: 'carrierType',
        sortOrder: 'sortOrder',
        status: 'status',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { sortOrder: 'asc' },
    })
    const types = (codesFilter(filters, 'type')?.in ?? []).filter((t) => CARRIER_TYPE.has(t))
    const where = {
      AND: [
        operatorFilter(scope),
        query.where,
        types.length > 0 ? { carrierType: { in: types } } : {},
        statusWhere(filters),
        deletedWhere(filters),
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.carrier.findMany({
        ...query,
        where,
        select: {
          id: true,
          code: true,
          custCode: true,
          name: true,
          carrierType: true,
          invoiceDigits: true,
          invoiceCheck: true,
          trackingUrl: true,
          tel: true,
          status: true,
          sortOrder: true,
          updatedAt: true,
          // 지운 계약은 세지 않는다
          _count: { select: { contracts: { where: { delYn: 'N' } } } },
        },
      }),
      prisma.carrier.count({ where }),
    ])
    return {
      rows: rows.map(({ _count, ...row }) => ({ ...row, contractCount: _count.contracts })),
      rowCount,
    }
  },
})

export const createCarrierAction = createAction({
  permission: 'master.carriers.create',
  input: carrierCreateSchema,
  handler: ({ input }) => createCarrier(input),
})

export const updateCarrierAction = createAction({
  permission: 'master.carriers.update',
  input: carrierSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: ({ input: { id, rowVersion, ...data } }) => updateCarrier(id, rowVersion, data),
})

export const setCarriersActiveAction = createAction({
  permission: 'master.carriers.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: ({ input }) => setCarriersActive([...new Set(input.ids)], input.isActive),
})

export const deleteCarriersAction = createAction({
  permission: 'master.carriers.delete',
  input: z.object({ ids: idsSchema }),
  handler: ({ input }) => deleteCarriers([...new Set(input.ids)]),
})

// 되살리기 (삭제 권한). 같은 코드가 다시 생겼으면 거부
export const restoreCarriersAction = createAction({
  permission: 'master.carriers.delete',
  input: z.object({ ids: idsSchema }),
  handler: ({ input }) => restoreCarriers([...new Set(input.ids)]),
})
