'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { deliveryZoneSchema } from '@/lib/delivery-zones/delivery-zone-schema'
import {
  createDeliveryZone,
  deleteDeliveryZones,
  updateDeliveryZone,
} from '@/lib/delivery-zones/delivery-zones'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { dateRangeFilter, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { rowVersionField } from '@/lib/row-version'
import { idSchema } from '@/lib/id'
import { toStatus, withIsActive } from '@/lib/status'

// 배송권역 서버 액션 (docs/decisions/0033)
// 데이터 범위: 센터 직원은 소속 센터의 권역만 보고 다룬다

const ZONE_SCOPE = { center: 'centerId' }

const idsSchema = z.array(idSchema).min(1).max(500)

// 고른 권역이 모두 범위 안에 있어야 한다 (하나라도 밖·없음이면 전체 거부)
async function assertZonesInScope(ids: bigint[], scope: DataScope) {
  const unique = [...new Set(ids)]
  const count = await prisma.deliveryZone.count({
    where: { AND: [{ id: { in: unique } }, scopeFilter(scope, ZONE_SCOPE)] },
  })
  if (count !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 배송권역이 섞여 있습니다.')
  }
  return unique
}

// 목록 (검색 조건: 배송권역 목록 화면의 searchFields와 같은 키 — center·status·sido·createdAt)
export const listDeliveryZonesAction = createAction({
  permission: 'master.delivery-zones.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.delivery-zones.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'systemCode', 'name', 'center.name', 'center.code'],
      sortable: {
        code: 'code',
        name: 'name',
        center: 'center.code',
        isActive: 'status',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    const createdAt = dateRangeFilter(filters, 'createdAt')
    // 시·도로 거르기: 그 시·도 전체 또는 그 시·도의 시·군·구를 담당하는 권역
    const sido = /^\d{2}$/.test(filters.sido ?? '') ? filters.sido! : undefined
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, ZONE_SCOPE),
        idFilter(filters, 'center') ? { centerId: idFilter(filters, 'center') } : {},
        statusWhere(filters),
        sido ? { regions: { some: { regionCode: { startsWith: sido } } } } : {},
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.deliveryZone.findMany({
        ...query,
        // 정렬을 고르지 않으면 센터별로 묶어서 (센터 코드 → 권역 코드)
        orderBy:
          input.sorting.length > 0 ? query.orderBy : [{ center: { code: 'asc' } }, { code: 'asc' }],
        where,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          center: { select: { code: true, name: true } },
          regions: { select: { regionCode: true } },
        },
      }),
      prisma.deliveryZone.count({ where }),
    ])
    return {
      rows: rows.map(withIsActive).map(({ center, regions, ...row }) => ({
        ...row,
        center: `${center.name} (${center.code})`,
        regionCodes: regions.map((r) => r.regionCode),
        regionCount: regions.length,
      })),
      rowCount,
    }
  },
})

export const createDeliveryZoneAction = createAction({
  permission: 'master.delivery-zones.create',
  input: deliveryZoneSchema,
  handler: async ({ input, scope }) => {
    assertInScope(scope, { centerId: input.centerId }, ZONE_SCOPE)
    return createDeliveryZone(input)
  },
})

export const updateDeliveryZoneAction = createAction({
  permission: 'master.delivery-zones.update',
  // rowVersion: 화면이 불러온 버전 (동시 수정 막기)
  input: deliveryZoneSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await assertZonesInScope([id], scope)
    return updateDeliveryZone(id, rowVersion, data)
  },
})

// 사용 중지 / 다시 사용 (한 건·여러 건 공용)
export const setDeliveryZonesActiveAction = createAction({
  permission: 'master.delivery-zones.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    const ids = await assertZonesInScope(input.ids, scope)
    const { count } = await prisma.deliveryZone.updateMany({
      where: { id: { in: ids } },
      data: { status: toStatus(input.isActive) },
    })
    return { count }
  },
})

// 삭제: 쓰인 적 없는 권역만
export const deleteDeliveryZonesAction = createAction({
  permission: 'master.delivery-zones.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    const ids = await assertZonesInScope(input.ids, scope)
    return deleteDeliveryZones(ids)
  },
})
