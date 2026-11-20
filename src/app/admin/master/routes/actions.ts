'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { deletedWhere, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { prisma, type Db } from '@/lib/prisma'
import { regionTreeChildren, zipsOfNode } from '@/lib/regions/region-queries'
import { TEMP_ZONE_ALL } from '@/lib/regions/region-codes'
import { rowVersionField } from '@/lib/row-version'
import { routeCreateSchema, routeSchema } from '@/lib/routes/route-schema'
import { assignRouteZips, planRouteZips, unassignRouteZips } from '@/lib/routes/route-zips'
import {
  assertRoutesInScope,
  createRoute,
  deleteRoutes,
  restoreRoutes,
  setRoutesActive,
  updateRoute,
} from '@/lib/routes/routes'
import { parseZipInput } from '@/lib/routes/zip-input'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 배송 코스 서버 액션 (docs/decisions/0095) — 권한 master.routes.*, 센터 직원은 소속 센터 코스만

const idsSchema = z.array(idSchema).min(1).max(200)

// 목록 (검색 조건: 코스 목록 화면의 searchFields와 같은 키 — center·carrier·status)
export const listRoutesAction = createAction({
  permission: 'master.routes.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.routes.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'custCode', 'name', 'destHub'],
      sortable: {
        code: 'code',
        name: 'name',
        sortOrder: 'sortOrder',
        status: 'status',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { sortOrder: 'asc' },
    })
    const center = idFilter(filters, 'center')
    const carrier = idFilter(filters, 'carrier')
    const where = {
      AND: [
        scopeFilter(scope, { center: 'centerId' }),
        query.where,
        center ? { centerId: center } : {},
        carrier ? { carrierId: carrier } : {},
        statusWhere(filters),
        deletedWhere(filters),
      ],
    }
    const orderBy =
      input.sorting.length === 0
        ? [
            { center: { sortOrder: 'asc' as const } },
            { sortOrder: 'asc' as const },
            { code: 'asc' as const },
          ]
        : query.orderBy
    const [rows, rowCount] = await prisma.$transaction([
      prisma.route.findMany({
        ...query,
        orderBy,
        where,
        select: {
          id: true,
          code: true,
          custCode: true,
          name: true,
          runDays: true,
          cutoffTime: true,
          vehicleTon: true,
          destHub: true,
          status: true,
          sortOrder: true,
          updatedAt: true,
          center: { select: { name: true } },
          carrier: { select: { name: true } },
          _count: { select: { zips: true, shipTos: { where: { delYn: 'N' } } } },
        },
      }),
      prisma.route.count({ where }),
    ])
    return {
      rows: rows.map(({ center, carrier, _count, cutoffTime, ...row }) => ({
        ...row,
        centerName: center.name,
        carrierName: carrier?.name ?? null,
        cutoffTime: cutoffTime ? cutoffTime.toISOString().slice(11, 16) : null,
        zipCount: _count.zips,
        manualShipToCount: _count.shipTos,
      })),
      rowCount,
    }
  },
})

export const createRouteAction = createAction({
  permission: 'master.routes.create',
  input: routeCreateSchema,
  handler: ({ input, scope }) => createRoute(input, scope),
})

export const updateRouteAction = createAction({
  permission: 'master.routes.update',
  input: routeSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: ({ input: { id, rowVersion, ...data }, scope }) =>
    updateRoute(id, rowVersion, data, scope),
})

export const setRoutesActiveAction = createAction({
  permission: 'master.routes.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    const rows = await assertRoutesInScope([...new Set(input.ids)], scope)
    return setRoutesActive(
      rows.map((r) => r.id),
      input.isActive,
    )
  },
})

export const deleteRoutesAction = createAction({
  permission: 'master.routes.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    deleteRoutes(await assertRoutesInScope([...new Set(input.ids)], scope)),
})

export const restoreRoutesAction = createAction({
  permission: 'master.routes.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    const rows = await assertRoutesInScope([...new Set(input.ids)], scope, true)
    return restoreRoutes(rows.map((r) => r.id))
  },
})

// ── 우편번호 배정

// 코스 한 건 (범위 안)
async function routeInScope(db: Db, id: bigint, scope: DataScope) {
  const route = await db.route.findUnique({
    where: { id },
    select: { id: true, operatorId: true, centerId: true },
  })
  assertInScope(scope, route, { center: 'centerId' })
  return route!
}

// 지역 고르기 (시도 → 시군구 → 읍면동): 이름과 우편번호 수만
export const listRouteRegionsAction = createAction({
  permission: 'master.routes.read',
  input: z.object({
    parent: z.object({ level: z.enum(['SIDO', 'SIGUNGU']), code: z.string().max(10) }).nullable(),
  }),
  handler: async ({ input, scope }) => {
    if (scope.operatorId === undefined) return []
    const nodes = await regionTreeChildren(prisma, scope.operatorId, input.parent, TEMP_ZONE_ALL)
    return nodes.map((n) => ({ level: n.level, code: n.code, name: n.name, zipCount: n.zipCount }))
  },
})

// 넣을 우편번호: 붙여넣기 글자 또는 지역 (onlyCenter: 권역설정에서 이 코스 센터로 배정된 우편번호만)
const zipSourceSchema = z.object({
  routeId: idSchema,
  text: z.string().max(20_000).default(''),
  node: z
    .object({ level: z.enum(['SIDO', 'SIGUNGU', 'EMD']), code: z.string().max(10) })
    .nullable()
    .default(null),
  onlyCenter: z.boolean().default(true),
})

async function zipsOfSource(
  db: Db,
  route: { operatorId: bigint; centerId: bigint },
  source: z.output<typeof zipSourceSchema>,
) {
  const parsed = parseZipInput(source.text)
  let zips = parsed.zips
  if (source.node) zips = [...zips, ...(await zipsOfNode(db, source.node)).zips]
  if (source.onlyCenter && zips.length > 0) {
    const mine = await db.regionCenterMap.findMany({
      where: {
        operatorId: route.operatorId,
        centerId: route.centerId,
        tempZone: TEMP_ZONE_ALL,
        zipCode: { in: zips },
      },
      select: { zipCode: true },
    })
    const keep = new Set(mine.map((m) => m.zipCode))
    zips = zips.filter((z) => keep.has(z))
  }
  if (zips.length > 5000) {
    throw new ActionError(
      'VALIDATION',
      '한 번에 5,000개까지 배정할 수 있습니다. 지역을 나눠 주세요.',
    )
  }
  return { zips, invalid: parsed.invalid }
}

export const planRouteZipsAction = createAction({
  permission: 'master.routes.update',
  input: zipSourceSchema,
  handler: async ({ input, scope }) => {
    const route = await routeInScope(prisma, input.routeId, scope)
    const { zips, invalid } = await zipsOfSource(prisma, route, input)
    const plan = await planRouteZips(prisma, route, zips)
    return { ...plan, count: plan.zips.length, zips: plan.zips.slice(0, 20), invalid }
  },
})

export const assignRouteZipsAction = createAction({
  permission: 'master.routes.update',
  input: zipSourceSchema,
  handler: async ({ input, scope }) => {
    const route = await routeInScope(prisma, input.routeId, scope)
    const { zips } = await zipsOfSource(prisma, route, input)
    const plan = await assignRouteZips(route, zips)
    return { count: plan.zips.length }
  },
})

export const unassignRouteZipsAction = createAction({
  permission: 'master.routes.update',
  input: z.object({
    routeId: idSchema,
    zips: z
      .array(z.string().regex(/^\d{5}$/))
      .min(1)
      .max(5000),
  }),
  handler: async ({ input, scope }) => {
    await routeInScope(prisma, input.routeId, scope)
    return unassignRouteZips(input.routeId, input.zips)
  },
})
