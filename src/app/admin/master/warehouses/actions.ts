'use server'

import { z } from 'zod'
import { TEMP_ZONE } from '@/config/operator-codes'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { isCenterSetupStatus } from '@/lib/centers/center-status'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import {
  codesFilter,
  dateRangeFilter,
  deletedWhere,
  idFilter,
  statusWhere,
  ynFilter,
} from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { DELETED_ONLY, NOT_DELETED, withIsActive } from '@/lib/status'
import { isYes } from '@/lib/yn'
import { WAREHOUSE_TYPE } from '@/lib/warehouses/warehouse-codes'
import { warehouseCreateSchema, warehouseUpdateSchema } from '@/lib/warehouses/warehouse-schema'
import {
  createWarehouse,
  deleteWarehouses,
  restoreWarehouses,
  setWarehousesActive,
  updateWarehouse,
} from '@/lib/warehouses/warehouses'

// 창고 관리 서버 액션 (docs/decisions/0027, 0074)
// 데이터 범위: 센터 직원은 소속 센터의 창고만 보고 다룬다 (창고 추가도 자기 센터 안에서만)

const WAREHOUSE_SCOPE = { center: 'centerId' }

// 범위 안의 창고인지 확인하고 가져온다 (밖이면 "찾을 수 없음")
async function findWarehouseInScope(id: bigint, scope: DataScope) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, operatorId: true, centerId: true, center: { select: { status: true } } },
  })
  assertInScope(scope, warehouse, WAREHOUSE_SCOPE)
  return warehouse!
}

// 여러 창고: 하나라도 범위 밖·없음이면 전체 거부
async function findWarehousesInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const unique = [...new Set(ids)]
  const found = await prisma.warehouse.findMany({
    where: {
      AND: [
        { id: { in: unique } },
        scopeFilter(scope, WAREHOUSE_SCOPE),
        deleted ? DELETED_ONLY : {},
      ],
    },
    select: { id: true, code: true, systemYn: true },
  })
  if (found.length !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 창고가 섞여 있습니다.')
  }
  return found
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
      searchFields: ['code', 'systemCode', 'name'],
      sortable: {
        center: 'center.code',
        code: 'code',
        name: 'name',
        type: 'type',
        tempZone: 'tempZone',
        buildingName: 'buildingName',
        floorNo: 'floorNo',
        areaM2: 'areaM2',
        allocatable: 'allocatableYn',
        isActive: 'status',
        sortOrder: 'sortOrder',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    // 정해진 값만 조건으로 (모르는 값은 무시)
    const types = codesFilter(filters, 'type')?.in.filter((c) => WAREHOUSE_TYPE.has(c))
    const tempZones = codesFilter(filters, 'tempZone')?.in.filter((c) => TEMP_ZONE.has(c))
    const allocatable = ynFilter(filters, 'allocatable')
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const center = idFilter(filters, 'center')
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, WAREHOUSE_SCOPE),
        center ? { centerId: center } : {},
        types?.length ? { type: { in: types } } : {},
        tempZones?.length ? { tempZone: { in: tempZones } } : {},
        allocatable ? { allocatableYn: allocatable } : {},
        statusWhere(filters),
        deletedWhere(filters),
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.warehouse.findMany({
        ...query,
        // 기본 순서: 센터 정렬순서 → 창고 정렬순서 → 창고코드
        orderBy:
          input.sorting.length > 0
            ? query.orderBy
            : [
                { center: { sortOrder: 'asc' } },
                { center: { code: 'asc' } },
                { sortOrder: 'asc' },
                { code: 'asc' },
              ],
        where,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          description: true,
          type: true,
          tempZone: true,
          systemYn: true,
          buildingName: true,
          floorNo: true,
          areaM2: true,
          allocatableYn: true,
          sortOrder: true,
          status: true,
          delYn: true,
          createdAt: true,
          updatedAt: true,
          center: { select: { code: true, name: true } },
          _count: { select: { locations: { where: NOT_DELETED } } },
        },
      }),
      prisma.warehouse.count({ where }),
    ])
    return {
      rows: rows
        .map(withIsActive)
        .map(({ _count, center, systemYn, allocatableYn, areaM2, delYn, ...row }) => ({
          ...row,
          center: `${center.name} (${center.code})`,
          isSystem: isYes(systemYn),
          allocatable: isYes(allocatableYn),
          areaM2: areaM2?.toString() ?? null,
          isDeleted: isYes(delYn),
          locationCount: _count.locations,
        })),
      rowCount,
    }
  },
})

export const createWarehouseAction = createAction({
  permission: 'master.warehouses.create',
  input: warehouseCreateSchema,
  handler: async ({ input: { centerId, code, ...data }, scope }) => {
    // 범위 검사는 DB에서 읽은 센터로 (운영사·소속 센터)
    const center = await prisma.center.findUnique({
      where: { id: centerId },
      select: { id: true, operatorId: true, status: true },
    })
    assertInScope(scope, center, { center: 'id' })
    if (!isCenterSetupStatus(center!.status)) {
      throw new ActionError('CONFLICT', '일시중지·폐쇄된 센터에는 창고를 추가할 수 없습니다.')
    }
    return createWarehouse(centerId, code, data)
  },
})

export const updateWarehouseAction = createAction({
  permission: 'master.warehouses.update',
  // rowVersion: 화면이 불러온 버전 (동시 수정 막기). 코드·센터는 받지 않는다 (바꿀 수 없음)
  input: warehouseUpdateSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    const warehouse = await findWarehouseInScope(id, scope)
    if (warehouse.center.status === 'CLOSED') {
      throw new ActionError('CONFLICT', '폐쇄된 센터의 창고는 고칠 수 없습니다.')
    }
    return updateWarehouse(id, rowVersion, data)
  },
})

// 사용 중지 / 다시 사용 (편집 화면 한 건·목록 일괄 공용)
export const setWarehousesActiveAction = createAction({
  permission: 'master.warehouses.update',
  input: z.object({ ids: z.array(idSchema).min(1).max(500), isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    const found = await findWarehousesInScope(input.ids, scope)
    return setWarehousesActive(found, input.isActive)
  },
})

// 삭제 (논리 삭제): 로케이션·재고 기록이 없는 창고만
export const deleteWarehousesAction = createAction({
  permission: 'master.warehouses.delete',
  input: z.object({ ids: z.array(idSchema).min(1).max(500) }),
  handler: async ({ input, scope }) => {
    const found = await findWarehousesInScope(input.ids, scope)
    return deleteWarehouses(found)
  },
})

// 되살리기 (목록 상태 거르기 "삭제됨"에서)
export const restoreWarehousesAction = createAction({
  permission: 'master.warehouses.delete',
  input: z.object({ ids: z.array(idSchema).min(1).max(500) }),
  handler: async ({ input, scope }) => {
    const found = await findWarehousesInScope(input.ids, scope, true)
    return restoreWarehouses(found.map((w) => w.id))
  },
})
