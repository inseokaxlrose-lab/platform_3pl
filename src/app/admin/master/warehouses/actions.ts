'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter } from '@/lib/grid/list-filters'
import { STORAGE_CONDITIONS, WAREHOUSE_TYPE_LABELS } from '@/lib/warehouses/warehouse-labels'
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

// 목록 (검색 조건: 창고 목록 화면의 searchFields와 같은 키). 엑셀 전체는 엑셀 권한 필요
export const listWarehousesAction = createAction({
  permission: 'master.warehouses.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.warehouses.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'systemCode', 'name', 'center.name', 'center.code'],
      sortable: {
        center: 'center.code',
        code: 'code',
        name: 'name',
        type: 'type',
        storageCondition: 'storageCondition',
        isActive: 'isActive',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    // 정해진 값만 조건으로 (모르는 값은 무시)
    const storage = codesFilter(filters, 'storage')?.in.filter((c) =>
      (STORAGE_CONDITIONS as readonly string[]).includes(c),
    ) as (typeof STORAGE_CONDITIONS)[number][] | undefined
    const type = filters.type && filters.type in WAREHOUSE_TYPE_LABELS ? filters.type : undefined
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, WAREHOUSE_SCOPE),
        filters.center ? { centerId: filters.center } : {},
        type ? { type: type as keyof typeof WAREHOUSE_TYPE_LABELS } : {},
        storage?.length ? { storageCondition: { in: storage } } : {},
        filters.status === 'ACTIVE' ? { isActive: true } : {},
        filters.status === 'INACTIVE' ? { isActive: false } : {},
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.warehouse.findMany({
        ...query,
        // 사용자가 정렬을 고르지 않았으면 센터별로 묶어서 (센터 코드 → 창고 코드)
        orderBy:
          input.sorting.length > 0 ? query.orderBy : [{ center: { code: 'asc' } }, { code: 'asc' }],
        where,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          type: true,
          storageCondition: true,
          isActive: true,
          createdAt: true,
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

// 여러 창고 한꺼번에 사용 중지 / 다시 사용 (목록 일괄 처리)
// 하나라도 범위 밖·없음이면 전체 거부, 입고대기 창고가 섞이면 사용 중지 거부
export const setWarehousesActiveAction = createAction({
  permission: 'master.warehouses.update',
  input: z.object({ ids: z.array(z.string().min(1)).min(1).max(500), isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    const ids = [...new Set(input.ids)]
    const found = await prisma.warehouse.findMany({
      where: { AND: [{ id: { in: ids } }, scopeFilter(scope, WAREHOUSE_SCOPE)] },
      select: { code: true, type: true },
    })
    if (found.length !== ids.length) {
      throw new ActionError('NOT_FOUND', '찾을 수 없는 창고가 섞여 있습니다.')
    }
    const staging = found.filter((w) => w.type === 'INBOUND_STAGING')
    if (!input.isActive && staging.length > 0) {
      throw new ActionError(
        'CONFLICT',
        `입고대기 창고는 사용 중지할 수 없습니다: ${staging.map((w) => w.code).join(', ')}`,
      )
    }
    const { count } = await prisma.warehouse.updateMany({
      where: { id: { in: ids } },
      data: { isActive: input.isActive },
    })
    return { count }
  },
})
