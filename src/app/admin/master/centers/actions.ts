'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import {
  centerCreateSchema,
  centerShape,
  centerStatusSchema,
  requireAddress,
} from '@/lib/centers/center-schema'
import {
  changeCenterStatus,
  changeCentersStatus,
  createCenter,
  deleteCenter,
  updateCenter,
} from '@/lib/centers/centers'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter, textFilter, ynFilter } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { rowVersionField } from '@/lib/row-version'
import { idSchema } from '@/lib/id'
import { NOT_DELETED } from '@/lib/status'

// 센터 관리 서버 액션 (docs/decisions/0026, 0073)
// 데이터 범위: 센터 직원은 소속 센터만 보고 고칠 수 있다. 등록·상태 변경·삭제는 전체 범위(운영사)만

const CENTER_SCOPE = { center: 'id' }

function requireAllScope(scope: DataScope, what: string) {
  if (scope.kind !== 'ALL') {
    throw new ActionError('FORBIDDEN', `${what}은(는) 운영사 사용자만 할 수 있습니다.`)
  }
}

// 목록 (검색 조건: 센터 목록 화면의 searchFields와 같은 키)
// exportAll(엑셀 전체)은 엑셀 권한이 있어야 한다
export const listCentersAction = createAction({
  permission: 'master.centers.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.centers.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'name', 'shortName'],
      sortable: {
        code: 'code',
        name: 'name',
        type: 'type',
        status: 'status',
        regionName: 'regionName',
        storageAreaM2: 'storageAreaM2',
        sortOrder: 'sortOrder',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      // 기본: 정렬순서 → 센터코드
      defaultOrderBy: { sortOrder: 'asc' },
    })
    const bonded = ynFilter(filters, 'bonded')
    const tempZones = codesFilter(filters, 'tempZone')
    // 검색어·조건·데이터 범위를 모두 만족 (AND)
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, CENTER_SCOPE),
        codesFilter(filters, 'status') ? { status: codesFilter(filters, 'status') } : {},
        codesFilter(filters, 'type') ? { type: codesFilter(filters, 'type') } : {},
        textFilter(filters, 'region') ? { regionName: textFilter(filters, 'region') } : {},
        bonded ? { bondedYn: bonded } : {},
        // 고른 온도대를 하나라도 취급하는 센터
        tempZones ? { tempZones: { some: { tempZoneCd: tempZones } } } : {},
        dateRangeFilter(filters, 'createdAt')
          ? { createdAt: dateRangeFilter(filters, 'createdAt') }
          : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.center.findMany({
        where,
        orderBy: [...query.orderBy, { code: 'asc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          status: true,
          regionName: true,
          phone: true,
          storageAreaM2: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
          // 대표 담당자
          contacts: { where: { isPrimary: 'Y' }, select: { name: true }, take: 1 },
          tempZones: { select: { tempZoneCd: true }, orderBy: { tempZoneCd: 'asc' } },
          _count: { select: { shippers: true } },
        },
      }),
      prisma.center.count({ where }),
    ])
    // 로케이션 수: 시스템 기본 창고(입고·출고·반품 대기)를 뺀 창고의 로케이션
    const locationCounts = await prisma.warehouse.findMany({
      where: {
        centerId: { in: rows.map((r) => r.id) },
        systemYn: 'N',
      },
      select: { centerId: true, _count: { select: { locations: { where: NOT_DELETED } } } },
    })
    const locationsOf = (centerId: bigint) =>
      locationCounts
        .filter((w) => w.centerId === centerId)
        .reduce((sum, w) => sum + w._count.locations, 0)
    return {
      rows: rows.map(({ contacts, tempZones, _count, storageAreaM2, ...row }) => ({
        ...row,
        storageAreaM2: storageAreaM2?.toString() ?? null,
        manager: contacts[0]?.name ?? null,
        tempZones: tempZones.map((z) => z.tempZoneCd),
        shipperCount: _count.shippers,
        locationCount: locationsOf(row.id),
      })),
      rowCount,
    }
  },
})

export const createCenterAction = createAction({
  permission: 'master.centers.create',
  input: centerCreateSchema,
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '센터 등록')
    return createCenter(input)
  },
})

// 범위 검사는 DB에서 읽은 센터로 (운영사·소속 센터)
async function assertCenterInScope(scope: DataScope, id: bigint) {
  const center = await prisma.center.findUnique({
    where: { id },
    select: { id: true, operatorId: true },
  })
  assertInScope(scope, center, CENTER_SCOPE)
}

export const updateCenterAction = createAction({
  permission: 'master.centers.update',
  // rowVersion: 화면이 불러온 버전 (동시 수정 막기). 센터코드는 받지 않는다 (바꿀 수 없음)
  input: z
    .object({ ...centerShape, id: idSchema, rowVersion: rowVersionField })
    .superRefine(requireAddress),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await assertCenterInScope(scope, id)
    return updateCenter(id, rowVersion, data)
  },
})

// 운영 상태 변경 (헤더의 [상태 변경]): 일시중지·폐쇄는 사유, 폐쇄는 운영 종료일·재고·입고 확인
export const changeCenterStatusAction = createAction({
  permission: 'master.centers.update',
  input: centerStatusSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: async ({ input: { id, rowVersion, ...status }, scope }) => {
    requireAllScope(scope, '센터 상태 변경')
    await assertCenterInScope(scope, id)
    return changeCenterStatus(id, rowVersion, status)
  },
})

// 여러 센터 한꺼번에 운영중 / 일시중지 (목록의 일괄 처리). 하나라도 없으면 전체 거부, 폐쇄된 센터는 건너뜀
export const changeCentersStatusAction = createAction({
  permission: 'master.centers.update',
  input: z
    .object({
      ids: z.array(idSchema).min(1).max(500),
      status: z.enum(['ACTIVE', 'SUSPENDED']),
      reason: z
        .string()
        .trim()
        .max(200)
        .transform((v) => v || null),
    })
    .refine((v) => v.status !== 'SUSPENDED' || v.reason, {
      path: ['reason'],
      message: '일시중지 사유를 입력해 주세요.',
    }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '센터 상태 변경')
    const ids = [...new Set(input.ids)]
    const found = await prisma.center.count({ where: { id: { in: ids } } })
    if (found !== ids.length)
      throw new ActionError('NOT_FOUND', '찾을 수 없는 센터가 섞여 있습니다.')
    return changeCentersStatus(ids, input.status, input.reason)
  },
})

// 삭제: 한 번도 쓰이지 않은 센터만 (쓰였으면 '폐쇄'로 안내)
export const deleteCenterAction = createAction({
  permission: 'master.centers.delete',
  input: z.object({ id: idSchema }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '센터 삭제')
    return deleteCenter(input.id)
  },
})
