'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { dateRangeFilter, idFilter, statusWhere, ynFilter } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { isYes } from '@/lib/yn'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { LABEL_UNITS, shipperSchema } from '@/lib/shippers/shipper-schema'
import { createShipper, updateShipper } from '@/lib/shippers/shippers'
import { rowVersionField } from '@/lib/row-version'
import { idSchema } from '@/lib/id'
import { toStatus, withIsActive } from '@/lib/status'

// 화주사 관리 서버 액션 (docs/decisions/0035)
// 데이터 범위: 센터 직원은 자기 센터를 이용하는 화주사만 본다. 등록·수정·사용 중지는 운영사(전체 범위)만

const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }

function requireAllScope(scope: DataScope, what: string) {
  if (scope.kind !== 'ALL') {
    throw new ActionError('FORBIDDEN', `${what}은(는) 운영사 사용자만 할 수 있습니다.`)
  }
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
      searchFields: ['code', 'systemCode', 'name', 'businessNumber'],
      sortable: {
        code: 'code',
        name: 'name',
        isActive: 'status',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    const useLot = ynFilter(filters, 'lot')
    const useExpiry = ynFilter(filters, 'expiry')
    const labelUnit = (LABEL_UNITS as readonly string[]).includes(filters.labelUnit ?? '')
      ? (filters.labelUnit as (typeof LABEL_UNITS)[number])
      : undefined
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, SHIPPER_SCOPE),
        idFilter(filters, 'center')
          ? { centers: { some: { centerId: idFilter(filters, 'center') } } }
          : {},
        statusWhere(filters),
        useLot !== undefined ? { useLot } : {},
        useExpiry !== undefined ? { useExpiry } : {},
        labelUnit ? { labelUnit } : {},
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
          businessNumber: true,
          phone: true,
          useLot: true,
          useExpiry: true,
          labelUnit: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          centers: { select: { center: { select: { name: true } } } },
          _count: { select: { users: true } },
        },
      }),
      prisma.shipper.count({ where }),
    ])
    return {
      rows: rows.map(withIsActive).map(({ centers, _count, ...row }) => ({
        ...row,
        // 예/아니오 칸은 화면에서 true/false로
        useLot: isYes(row.useLot),
        useExpiry: isYes(row.useExpiry),
        centers: centers.map((c) => c.center.name).join(', ') || null,
        userCount: _count.users,
      })),
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
  input: shipperSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    requireAllScope(scope, '화주사 수정')
    const shipper = await prisma.shipper.findUnique({ where: { id }, select: { id: true } })
    assertInScope(scope, shipper, { shipper: 'id' })
    return updateShipper(id, rowVersion, data)
  },
})

// 사용 중지 / 다시 사용 (한 건·여러 건 공용): 사용 중지하면 그 화주사 사용자의 데이터 범위가 비워진다
export const setShippersActiveAction = createAction({
  permission: 'master.shippers.update',
  input: z.object({ ids: z.array(idSchema).min(1).max(500), isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '화주사 사용 중지')
    const ids = [...new Set(input.ids)]
    if ((await prisma.shipper.count({ where: { id: { in: ids } } })) !== ids.length) {
      throw new ActionError('NOT_FOUND', '찾을 수 없는 화주사가 섞여 있습니다.')
    }
    const { count } = await prisma.shipper.updateMany({
      where: { id: { in: ids } },
      data: { status: toStatus(input.isActive) },
    })
    return { count }
  },
})
