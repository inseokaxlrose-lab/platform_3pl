'use server'

import { z } from 'zod'
import { LOCATION_BULK_MAX } from '@/config/locations'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { uploadRowsSchema } from '@/lib/excel/upload'
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
import { commitLocationUpload, previewLocationUpload } from '@/lib/locations/location-upload'
import {
  locationBulkSchema,
  locationCreateSchema,
  locationUpdateSchema,
} from '@/lib/locations/location-schema'
import {
  bulkCreateLocations,
  createLocation,
  deleteLocations,
  previewBulkLocations,
  restoreLocations,
  setLocationsActive,
  updateLocation,
} from '@/lib/locations/locations'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { resolveLocationOps } from '@/lib/settings/effective-setting'
import { DELETED_ONLY, withIsActive } from '@/lib/status'
import { isYes } from '@/lib/yn'

// 로케이션 관리 서버 액션 (docs/decisions/0028, 0075)
// 데이터 범위: 센터 직원은 소속 센터의 로케이션만 (로케이션이 센터 키를 갖는다)

const LOCATION_SCOPE = { center: 'centerId' }

// 범위 안의 창고 (밖이면 "찾을 수 없음")
async function findWarehouseInScope(warehouseId: bigint, scope: DataScope) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, operatorId: true, centerId: true, systemYn: true, status: true },
  })
  assertInScope(scope, warehouse, { center: 'centerId' })
  return warehouse!
}

// 고른 로케이션이 모두 범위 안에 있어야 한다 (하나라도 밖이면 전체 거부)
async function findLocationsInScope(ids: bigint[], scope: DataScope) {
  const unique = [...new Set(ids)]
  const locations = await prisma.location.findMany({
    where: { AND: [{ id: { in: unique } }, scopeFilter(scope, LOCATION_SCOPE)] },
    select: { id: true, code: true, systemYn: true },
  })
  if (locations.length !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 로케이션이 섞여 있습니다.')
  }
  return locations
}

const idsSchema = z.array(idSchema).min(1, '로케이션을 골라 주세요.').max(LOCATION_BULK_MAX)

// 코드 범위 'A-01~A-03' → { gte, lte } (한쪽만 있어도 됨). 코드 칸은 글자 그대로 비교(C 정렬)
function codeRangeFilter(value: string | undefined) {
  const [from = '', to = ''] = (value ?? '').split('~').map((v) => v.trim().toUpperCase())
  const range: { gte?: string; lte?: string } = {}
  if (from) range.gte = from
  // 끝 코드로 시작하는 것까지 (A-03 → A-03-99도 포함). '~'는 코드에 쓰는 글자보다 뒤
  if (to) range.lte = `${to}~`
  return range.gte || range.lte ? range : undefined
}

// 목록 (검색 조건: 로케이션 목록 화면의 searchFields와 같은 키). 엑셀 전체는 엑셀 권한 필요
export const listLocationsAction = createAction({
  permission: 'master.locations.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.locations.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'description'],
      sortable: {
        code: 'code',
        center: 'center.code',
        warehouse: 'warehouse.code',
        zone: 'zone.code',
        rowNo: 'rowNo',
        levelNo: 'levelNo',
        bayNo: 'bayNo',
        locType: 'locType',
        mixClient: 'mixClientYn',
        maxWeightKg: 'maxWeightKg',
        maxPalletCnt: 'maxPalletCnt',
        isActive: 'status',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    const codePrefix = filters.code?.trim().toUpperCase()
    const codeRange = codeRangeFilter(filters.codeRange)
    const locTypes = codesFilter(filters, 'locType')
    const mixClient = ynFilter(filters, 'mixClient')
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const hasStock = { stocks: { some: { qty: { gt: 0 } } } }
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, LOCATION_SCOPE),
        idFilter(filters, 'center') ? { centerId: idFilter(filters, 'center') } : {},
        idFilter(filters, 'warehouse') ? { warehouseId: idFilter(filters, 'warehouse') } : {},
        idFilter(filters, 'zone') ? { zoneId: idFilter(filters, 'zone') } : {},
        // 코드 앞부분 일치 ('A-01' → A-01로 시작) + 범위
        codePrefix ? { code: { startsWith: codePrefix } } : {},
        codeRange ? { code: codeRange } : {},
        locTypes ? { locType: locTypes } : {},
        filters.row?.trim() ? { rowNo: filters.row.trim().toUpperCase() } : {},
        filters.level?.trim() ? { levelNo: filters.level.trim().toUpperCase() } : {},
        mixClient ? { mixClientYn: mixClient } : {},
        filters.stock === 'HAS' ? hasStock : filters.stock === 'EMPTY' ? { NOT: hasStock } : {},
        statusWhere(filters),
        // '삭제됨'을 고르면 지운 것만 (아니면 prisma.ts가 지운 것을 뺀다)
        deletedWhere(filters),
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.location.findMany({
        ...query,
        // 기본 순서: 센터 → 창고 정렬순서 → 구역 정렬순서 → 로케이션 코드 (0을 채운 코드라 글자 순서 = 위치 순서)
        // 고른 정렬 뒤에도 코드 순을 붙여, 같은 값끼리의 순서가 늘 같게 한다
        orderBy:
          input.sorting.length > 0
            ? [...[query.orderBy].flat(), { code: 'asc' as const }]
            : [
                { center: { sortOrder: 'asc' } },
                { center: { code: 'asc' } },
                { warehouse: { sortOrder: 'asc' } },
                { warehouse: { code: 'asc' } },
                { zone: { sortOrder: 'asc' } },
                { code: 'asc' },
              ],
        where,
        select: {
          id: true,
          code: true,
          description: true,
          remark: true,
          rowVersion: true,
          systemYn: true,
          locType: true,
          rowNo: true,
          levelNo: true,
          bayNo: true,
          widthCm: true,
          depthCm: true,
          heightCm: true,
          maxCbm: true,
          maxWeightKg: true,
          maxPalletCnt: true,
          inboundYn: true,
          outboundYn: true,
          allocatableYn: true,
          mixItemYn: true,
          mixLotYn: true,
          mixClientYn: true,
          putawaySeq: true,
          pickSeq: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          warehouseId: true,
          zoneId: true,
          center: { select: { code: true, name: true } },
          zone: { select: { code: true } },
          warehouse: {
            select: {
              code: true,
              name: true,
              inboundYn: true,
              outboundYn: true,
              allocatableYn: true,
            },
          },
          _count: { select: { stocks: { where: { qty: { gt: 0 } } } } },
        },
      }),
      prisma.location.count({ where }),
    ])
    const text = (value: { toString(): string } | null) => value?.toString() ?? ''
    return {
      rows: rows.map(withIsActive).map(({ warehouse, center, zone, _count, ...row }) => {
        const ops = resolveLocationOps(row, warehouse)
        return {
          id: row.id,
          code: row.code,
          description: row.description,
          rowVersion: row.rowVersion,
          isSystem: isYes(row.systemYn),
          isActive: row.isActive,
          center: `${center.name} (${center.code})`,
          warehouse: `${warehouse.name} (${warehouse.code})`,
          warehouseId: row.warehouseId,
          zone: zone?.code ?? null,
          rowNo: row.rowNo,
          levelNo: row.levelNo,
          bayNo: row.bayNo,
          locType: row.locType,
          // 실제 적용값 (비어 있으면 창고 값)
          allocatable: ops.allocatable.value,
          mixClient: isYes(row.mixClientYn),
          maxWeightKg: row.maxWeightKg?.toString() ?? null,
          maxPalletCnt: row.maxPalletCnt,
          hasStock: _count.stocks > 0,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          // 수정 팝업에 채울 값 (용량은 cm·kg 글자)
          input: {
            zoneId: row.zoneId?.toString() ?? '',
            description: row.description ?? '',
            locType: row.locType,
            remark: row.remark ?? '',
            rowNo: row.rowNo ?? '',
            levelNo: row.levelNo ?? '',
            widthCm: text(row.widthCm),
            depthCm: text(row.depthCm),
            heightCm: text(row.heightCm),
            maxCbm: text(row.maxCbm),
            maxWeightKg: text(row.maxWeightKg),
            maxPalletCnt: row.maxPalletCnt,
            inbound: row.inboundYn === null ? null : isYes(row.inboundYn),
            outbound: row.outboundYn === null ? null : isYes(row.outboundYn),
            allocatable: row.allocatableYn === null ? null : isYes(row.allocatableYn),
            mixItem: isYes(row.mixItemYn),
            mixLot: isYes(row.mixLotYn),
            mixClient: isYes(row.mixClientYn),
            putawaySeq: row.putawaySeq,
            pickSeq: row.pickSeq,
          },
        }
      }),
      rowCount,
    }
  },
})

// 한 칸 추가 (팝업)
export const createLocationAction = createAction({
  permission: 'master.locations.create',
  input: locationCreateSchema,
  handler: async ({ input: { warehouseId, code, ...data }, scope }) => {
    const warehouse = await findWarehouseInScope(warehouseId, scope)
    return createLocation(warehouse, code, data)
  },
})

// 수정 (팝업): 범위 안의 로케이션만, 동시 수정은 버전으로 막는다. 코드·창고는 받지 않는다
export const updateLocationAction = createAction({
  permission: 'master.locations.update',
  input: z.intersection(
    locationUpdateSchema,
    z.object({ id: idSchema, rowVersion: rowVersionField }),
  ),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await findLocationsInScope([id], scope)
    return updateLocation(id, rowVersion, data)
  },
})

// 일괄 생성 미리보기: 만들 개수·건너뛸 개수·처음과 마지막 코드 (실제로 만들지 않음)
export const previewBulkLocationsAction = createAction({
  permission: 'master.locations.create',
  input: locationBulkSchema,
  handler: async ({ input, scope }) => {
    const warehouse = await findWarehouseInScope(input.warehouseId, scope)
    return previewBulkLocations(warehouse, input)
  },
})

export const bulkCreateLocationsAction = createAction({
  permission: 'master.locations.create',
  input: locationBulkSchema,
  handler: async ({ input, scope }) => {
    const warehouse = await findWarehouseInScope(input.warehouseId, scope)
    return bulkCreateLocations(warehouse, input)
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

// 되살리기: 지운 로케이션 (삭제 권한, 데이터 범위 안만). 같은 코드가 다시 생겼으면 거부
export const restoreLocationsAction = createAction({
  permission: 'master.locations.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    const ids = [...new Set(input.ids)]
    const inScope = await prisma.location.count({
      where: { AND: [{ id: { in: ids } }, DELETED_ONLY, scopeFilter(scope, LOCATION_SCOPE)] },
    })
    if (inScope !== ids.length) {
      throw new ActionError('NOT_FOUND', '찾을 수 없는 로케이션이 섞여 있습니다.')
    }
    return restoreLocations(ids)
  },
})

// 엑셀 일괄 업로드 (0071): 검증(저장 안 함) → 오류가 없을 때만 등록 (이미 있는 코드는 건너뜀)
export const validateLocationUploadAction = createAction({
  permission: 'master.locations.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope }) => previewLocationUpload(input, scope),
})

export const commitLocationUploadAction = createAction({
  permission: 'master.locations.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope }) => commitLocationUpload(input, scope),
})
