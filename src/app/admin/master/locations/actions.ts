'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import {
  locationCodeField,
  locationRangeSchema,
  MAX_BULK_LOCATIONS,
} from '@/lib/locations/location-range'
import {
  bulkCreateLocations,
  createLocation,
  deleteLocations,
  previewBulkLocations,
  setLocationsActive,
} from '@/lib/locations/locations'
import { prisma } from '@/lib/prisma'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { idField, idSchema } from '@/lib/id'
import { idFilter } from '@/lib/grid/list-filters'

// 로케이션 관리 서버 액션 (docs/decisions/0028)
// 데이터 범위: 센터 직원은 소속 센터 창고의 로케이션만

const LOCATION_SCOPE = { center: 'warehouse.centerId' }

// 범위 안의 창고 (밖이면 "찾을 수 없음")
async function findWarehouseInScope(warehouseId: bigint, scope: DataScope) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, centerId: true, type: true, isActive: true },
  })
  assertInScope(scope, warehouse, { center: 'centerId' })
  return warehouse!
}

// 고른 로케이션이 모두 범위 안에 있어야 한다 (하나라도 밖이면 전체 거부)
async function findLocationsInScope(ids: bigint[], scope: DataScope) {
  const unique = [...new Set(ids)]
  const locations = await prisma.location.findMany({
    where: { AND: [{ id: { in: unique } }, scopeFilter(scope, LOCATION_SCOPE)] },
    select: { id: true, code: true, warehouse: { select: { type: true } } },
  })
  if (locations.length !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 로케이션이 섞여 있습니다.')
  }
  return locations
}

const idsSchema = z.array(idSchema).min(1, '로케이션을 골라 주세요.').max(MAX_BULK_LOCATIONS)

// 목록 (검색 조건: 로케이션 목록 화면의 searchFields와 같은 키 — center·warehouse·zone·status)
// 엑셀 전체는 엑셀 권한 필요
export const listLocationsAction = createAction({
  permission: 'master.locations.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.locations.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code'],
      sortable: {
        center: 'warehouse.center.code',
        warehouse: 'warehouse.code',
        code: 'code',
        zone: 'zone',
        aisle: 'aisle',
        level: 'level',
        isActive: 'isActive',
        createdAt: 'createdAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, LOCATION_SCOPE),
        idFilter(filters, 'center') ? { warehouse: { centerId: idFilter(filters, 'center') } } : {},
        idFilter(filters, 'warehouse') ? { warehouseId: idFilter(filters, 'warehouse') } : {},
        filters.zone ? { zone: filters.zone } : {},
        filters.status === 'ACTIVE' ? { isActive: true } : {},
        filters.status === 'INACTIVE' ? { isActive: false } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.location.findMany({
        ...query,
        // 사용자가 정렬을 고르지 않으면 센터 → 창고 → 코드 순서 (0을 채운 코드라 글자 순서 = 위치 순서)
        orderBy:
          input.sorting.length > 0
            ? query.orderBy
            : [
                { warehouse: { center: { code: 'asc' } } },
                { warehouse: { code: 'asc' } },
                { code: 'asc' },
              ],
        where,
        select: {
          id: true,
          code: true,
          zone: true,
          aisle: true,
          level: true,
          isActive: true,
          createdAt: true,
          warehouse: {
            select: {
              code: true,
              name: true,
              type: true,
              center: { select: { code: true, name: true } },
            },
          },
        },
      }),
      prisma.location.count({ where }),
    ])
    return {
      rows: rows.map(({ warehouse, ...row }) => ({
        ...row,
        center: `${warehouse.center.name} (${warehouse.center.code})`,
        warehouse: `${warehouse.name} (${warehouse.code})`,
        // 입고대기 창고의 기본 로케이션: 사용 중지·삭제 불가
        protected: warehouse.type === 'INBOUND_STAGING',
      })),
      rowCount,
    }
  },
})

export const createLocationAction = createAction({
  permission: 'master.locations.create',
  input: z.object({
    warehouseId: idField('창고를 골라 주세요.'),
    code: locationCodeField,
  }),
  handler: async ({ input, scope }) => {
    const warehouse = await findWarehouseInScope(input.warehouseId, scope)
    return createLocation(warehouse, input.code)
  },
})

const bulkInput = z.object({
  warehouseId: idField('창고를 골라 주세요.'),
  range: locationRangeSchema,
})

// 일괄 생성 미리보기: 만들 개수·건너뛸 개수·처음과 마지막 코드 (실제로 만들지 않음)
export const previewBulkLocationsAction = createAction({
  permission: 'master.locations.create',
  input: bulkInput,
  handler: async ({ input, scope }) => {
    const warehouse = await findWarehouseInScope(input.warehouseId, scope)
    return previewBulkLocations(warehouse, input.range)
  },
})

export const bulkCreateLocationsAction = createAction({
  permission: 'master.locations.create',
  input: bulkInput,
  handler: async ({ input, scope }) => {
    const warehouse = await findWarehouseInScope(input.warehouseId, scope)
    return bulkCreateLocations(warehouse, input.range)
  },
})

export const setLocationsActiveAction = createAction({
  permission: 'master.locations.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    const locations = await findLocationsInScope(input.ids, scope)
    return setLocationsActive(locations, input.isActive)
  },
})

export const deleteLocationsAction = createAction({
  permission: 'master.locations.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    const locations = await findLocationsInScope(input.ids, scope)
    return deleteLocations(locations)
  },
})
