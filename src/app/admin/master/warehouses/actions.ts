'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { dataGridStateSchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { prisma } from '@/lib/prisma'
import { assertInScope, scopeFilter } from '@/lib/scope/data-scope'
import { createWarehouseSchema, updateWarehouseSchema } from '@/lib/warehouses/warehouse-schema'
import { createWarehouse, setWarehouseActive, updateWarehouse } from '@/lib/warehouses/warehouses'

// 창고 관리 서버 액션 (docs/decisions/0027)
// 데이터 범위: 센터 직원은 소속 센터의 창고만 보고 다룬다 (창고 추가도 자기 센터 안에서만)

const WAREHOUSE_SCOPE = { center: 'centerId' }

// 범위 안의 창고인지 확인하고 가져온다 (밖이면 "찾을 수 없음")
async function findWarehouseInScope(id: string, scope: Parameters<typeof assertInScope>[0]) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, centerId: true },
  })
  assertInScope(scope, warehouse, WAREHOUSE_SCOPE)
  return warehouse!
}

export const listWarehousesAction = createAction({
  permission: 'master.warehouses.read',
  // 그리드 상태 + 센터 고르기 (비우면 범위 안 전체)
  input: dataGridStateSchema.extend({ centerId: z.string().optional() }),
  handler: async ({ input: { centerId, ...state }, scope }) => {
    const query = toPrismaQuery(state, {
      searchFields: ['code', 'systemCode', 'name', 'center.name', 'center.code'],
      sortable: {
        center: 'center.code',
        code: 'code',
        name: 'name',
        type: 'type',
        storageCondition: 'storageCondition',
        isActive: 'isActive',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    const where = {
      AND: [query.where, scopeFilter(scope, WAREHOUSE_SCOPE), centerId ? { centerId } : {}],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.warehouse.findMany({
        ...query,
        // 사용자가 정렬을 고르지 않았으면 센터별로 묶어서 (센터 코드 → 창고 코드)
        orderBy:
          state.sorting.length > 0 ? query.orderBy : [{ center: { code: 'asc' } }, { code: 'asc' }],
        where,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          type: true,
          storageCondition: true,
          isActive: true,
          updatedAt: true,
          center: { select: { code: true, name: true } },
          _count: { select: { locations: true } },
        },
      }),
      prisma.warehouse.count({ where }),
    ])
    return {
      rows: rows.map(({ _count, center, ...row }) => ({
        ...row,
        center: `${center.name} (${center.code})`,
        locationCount: _count.locations,
      })),
      rowCount,
    }
  },
})

export const createWarehouseAction = createAction({
  permission: 'master.warehouses.create',
  input: createWarehouseSchema,
  handler: async ({ input: { centerId, ...data }, scope }) => {
    assertInScope(scope, { centerId }, WAREHOUSE_SCOPE)
    const center = await prisma.center.findUnique({
      where: { id: centerId },
      select: { isActive: true },
    })
    if (!center) throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
    if (!center.isActive) {
      throw new ActionError('CONFLICT', '사용 중지된 센터에는 창고를 추가할 수 없습니다.')
    }
    return createWarehouse(centerId, data)
  },
})

export const updateWarehouseAction = createAction({
  permission: 'master.warehouses.update',
  input: updateWarehouseSchema.extend({ id: z.string().min(1) }),
  handler: async ({ input: { id, ...data }, scope }) => {
    await findWarehouseInScope(id, scope)
    return updateWarehouse(id, data)
  },
})

export const setWarehouseActiveAction = createAction({
  permission: 'master.warehouses.update',
  input: z.object({ id: z.string().min(1), isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    await findWarehouseInScope(input.id, scope)
    return setWarehouseActive(input.id, input.isActive)
  },
})
