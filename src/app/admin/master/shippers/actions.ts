'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter, idFilter, ynFilter } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { isYes } from '@/lib/yn'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { shipperSchema, shipperStatusSchema } from '@/lib/shippers/shipper-schema'
import {
  changeShipperStatus,
  changeShippersStatus,
  createShipper,
  updateShipper,
} from '@/lib/shippers/shippers'
import { rowVersionField } from '@/lib/row-version'
import { idSchema } from '@/lib/id'
import { digitsOnly } from '@/lib/format'

// 화주사 관리 서버 액션 (docs/decisions/0035, 0080)
// 데이터 범위: 센터 직원은 자기 센터를 이용하는 화주사만 본다. 등록·수정·상태 변경은 운영사(전체 범위)만

const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }

function requireAllScope(scope: DataScope, what: string) {
  if (scope.kind !== 'ALL') {
    throw new ActionError('FORBIDDEN', `${what}은(는) 운영사 사용자만 할 수 있습니다.`)
  }
}

// 날짜 칸(DATE) 기간 ('2026-11-01~2026-11-30') → { gte, lte } (날짜 그대로 비교)
function dayRangeFilter(filters: Record<string, string>, key: string) {
  const [from = '', to = ''] = (filters[key] ?? '').split('~')
  const day = /^\d{4}-\d{2}-\d{2}$/
  const range: { gte?: Date; lte?: Date } = {}
  if (day.test(from)) range.gte = new Date(`${from}T00:00:00.000Z`)
  if (day.test(to)) range.lte = new Date(`${to}T00:00:00.000Z`)
  return range.gte || range.lte ? range : undefined
}

// 목록 (검색 조건: 화주사 목록 화면의 searchFields와 같은 키)
export const listShippersAction = createAction({
  permission: 'master.shippers.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.shippers.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'systemCode', 'name', 'shortName'],
      sortable: {
        code: 'code',
        name: 'name',
        shipperType: 'shipperType',
        ifMethod: 'ifMethod',
        contractStartOn: 'contractStartOn',
        contractEndOn: 'contractEndOn',
        status: 'status',
        sortOrder: 'sortOrder',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      // 기본: 정렬순서 → 코드
      defaultOrderBy: { sortOrder: 'asc' },
    })
    const api = ynFilter(filters, 'api')
    const center = idFilter(filters, 'center')
    const businessNumber = digitsOnly(filters.businessNumber ?? '')
    const contractEnd = dayRangeFilter(filters, 'contractEnd')
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, SHIPPER_SCOPE),
        codesFilter(filters, 'status') ? { status: codesFilter(filters, 'status') } : {},
        center ? { centers: { some: { centerId: center } } } : {},
        codesFilter(filters, 'shipperType')
          ? { shipperType: codesFilter(filters, 'shipperType') }
          : {},
        codesFilter(filters, 'industry') ? { industry: codesFilter(filters, 'industry') } : {},
        codesFilter(filters, 'ifMethod') ? { ifMethod: codesFilter(filters, 'ifMethod') } : {},
        api ? { apiEnabledYn: api } : {},
        businessNumber ? { businessNumber: { contains: businessNumber } } : {},
        contractEnd ? { contractEndOn: contractEnd } : {},
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.shipper.findMany({
        ...query,
        where,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          shipperType: true,
          ceoName: true,
          phone: true,
          ifMethod: true,
          apiEnabledYn: true,
          contractStartOn: true,
          contractEndOn: true,
          status: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
          centers: {
            select: { isDefault: true, status: true, center: { select: { name: true } } },
            orderBy: { startOn: 'asc' },
          },
          _count: { select: { users: true } },
        },
      }),
      prisma.shipper.count({ where }),
    ])
    const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)
    return {
      rows: rows.map(
        ({ centers, _count, apiEnabledYn, contractStartOn, contractEndOn, ...row }) => ({
          ...row,
          // 예/아니오 칸은 화면에서 true/false로
          apiEnabled: isYes(apiEnabledYn),
          contractStartOn: day(contractStartOn),
          contractEndOn: day(contractEndOn),
          // 이용 중인 센터 (기본 센터 먼저, ★ 표시)
          centers:
            centers
              .filter((c) => c.status === 'ACTIVE')
              .sort((a, b) => Number(isYes(b.isDefault)) - Number(isYes(a.isDefault)))
              .map((c) => (isYes(c.isDefault) ? `★${c.center.name}` : c.center.name))
              .join(', ') || null,
          userCount: _count.users,
        }),
      ),
      rowCount,
    }
  },
})

export const createShipperAction = createAction({
  permission: 'master.shippers.create',
  input: shipperSchema,
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '화주사 등록')
    return createShipper(input)
  },
})

export const updateShipperAction = createAction({
  permission: 'master.shippers.update',
  // rowVersion: 화면이 불러온 버전 (동시 수정 막기)
  input: shipperSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    requireAllScope(scope, '화주사 수정')
    const shipper = await prisma.shipper.findUnique({
      where: { id },
      select: { id: true, operatorId: true, status: true },
    })
    assertInScope(scope, shipper, { shipper: 'id' })
    // 해지된 화주사는 고칠 수 없다 (다시 쓰려면 상태부터 바꾼다)
    if (shipper!.status === 'TERMINATED') {
      throw new ActionError(
        'CONFLICT',
        '해지된 화주사는 고칠 수 없습니다. 상태를 먼저 바꿔 주세요.',
      )
    }
    return updateShipper(id, rowVersion, data)
  },
})

// 상태 변경 (헤더의 [상태 변경]): 일시정지·해지는 사유, 해지는 재고·입고 확인
export const changeShipperStatusAction = createAction({
  permission: 'master.shippers.update',
  input: shipperStatusSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: async ({ input: { id, rowVersion, ...status }, scope }) => {
    requireAllScope(scope, '화주사 상태 변경')
    const shipper = await prisma.shipper.findUnique({
      where: { id },
      select: { id: true, operatorId: true },
    })
    assertInScope(scope, shipper, { shipper: 'id' })
    return changeShipperStatus(id, rowVersion, status)
  },
})

// 여러 화주사 한꺼번에 운영중 / 일시정지 (목록의 일괄 처리). 하나라도 없으면 전체 거부, 해지된 화주사는 건너뜀
export const changeShippersStatusAction = createAction({
  permission: 'master.shippers.update',
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
      message: '일시정지 사유를 입력해 주세요.',
    }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '화주사 상태 변경')
    const ids = [...new Set(input.ids)]
    if ((await prisma.shipper.count({ where: { id: { in: ids } } })) !== ids.length) {
      throw new ActionError('NOT_FOUND', '찾을 수 없는 화주사가 섞여 있습니다.')
    }
    return changeShippersStatus(ids, input.status, input.reason)
  },
})
