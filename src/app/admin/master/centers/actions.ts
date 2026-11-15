'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { centerSchema } from '@/lib/centers/center-schema'
import { createCenter, updateCenter } from '@/lib/centers/centers'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter, digitsFilter, textFilter } from '@/lib/grid/list-filters'
import { STORAGE_CONDITIONS } from '@/lib/warehouses/warehouse-labels'
import { prisma } from '@/lib/prisma'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 센터 관리 서버 액션 (docs/decisions/0026)
// 데이터 범위: 센터 직원은 소속 센터만 보고 고칠 수 있다. 등록·사용 중지는 전체 범위(운영사)만

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
      searchFields: ['code', 'systemCode', 'name', 'address'],
      sortable: {
        code: 'code',
        systemCode: 'systemCode',
        name: 'name',
        managerName: 'managerName',
        isActive: 'isActive',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    const storage = codesFilter(filters, 'storage')
    const conditions = storage?.in.filter((c) =>
      (STORAGE_CONDITIONS as readonly string[]).includes(c),
    ) as (typeof STORAGE_CONDITIONS)[number][] | undefined
    // 검색어·조건·데이터 범위를 모두 만족 (AND)
    const where = {
      AND: [
        query.where,
        scopeFilter(scope, CENTER_SCOPE),
        filters.status === 'ACTIVE' ? { isActive: true } : {},
        filters.status === 'INACTIVE' ? { isActive: false } : {},
        digitsFilter(filters, 'phone') ? { phone: digitsFilter(filters, 'phone') } : {},
        textFilter(filters, 'manager') ? { managerName: textFilter(filters, 'manager') } : {},
        dateRangeFilter(filters, 'createdAt')
          ? { createdAt: dateRangeFilter(filters, 'createdAt') }
          : {},
        // 이 보관 조건의 창고를 하나라도 가진 센터
        conditions?.length
          ? { warehouses: { some: { storageCondition: { in: conditions } } } }
          : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.center.findMany({
        ...query,
        where,
        select: {
          id: true,
          systemCode: true,
          code: true,
          name: true,
          phone: true,
          managerName: true,
          managerPhone: true,
          address: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { warehouses: true } },
        },
      }),
      prisma.center.count({ where }),
    ])
    return {
      rows: rows.map(({ _count, ...row }) => ({ ...row, warehouseCount: _count.warehouses })),
      rowCount,
    }
  },
})

export const createCenterAction = createAction({
  permission: 'master.centers.create',
  input: centerSchema,
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '센터 등록')
    return createCenter(input)
  },
})

export const updateCenterAction = createAction({
  permission: 'master.centers.update',
  input: centerSchema.extend({ id: z.string().min(1) }),
  handler: async ({ input: { id, ...data }, scope }) => {
    assertInScope(scope, { id }, CENTER_SCOPE)
    return updateCenter(id, data)
  },
})

// 사용 중지 / 다시 사용 (삭제 없음): 사용 중지하면 소속 직원의 데이터 범위에서 빠진다
export const setCenterActiveAction = createAction({
  permission: 'master.centers.update',
  input: z.object({ id: z.string().min(1), isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '센터 사용 중지')
    const center = await prisma.center.findUnique({ where: { id: input.id }, select: { id: true } })
    if (!center) throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
    await prisma.center.update({ where: { id: input.id }, data: { isActive: input.isActive } })
    return { id: input.id, isActive: input.isActive }
  },
})

// 여러 센터 한꺼번에 사용 중지 / 다시 사용 (목록의 일괄 처리). 하나라도 없으면 전체 거부
export const setCentersActiveAction = createAction({
  permission: 'master.centers.update',
  input: z.object({ ids: z.array(z.string().min(1)).min(1).max(500), isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope, '센터 사용 중지')
    const ids = [...new Set(input.ids)]
    const found = await prisma.center.count({ where: { id: { in: ids } } })
    if (found !== ids.length)
      throw new ActionError('NOT_FOUND', '찾을 수 없는 센터가 섞여 있습니다.')
    const { count } = await prisma.center.updateMany({
      where: { id: { in: ids } },
      data: { isActive: input.isActive },
    })
    return { count }
  },
})
