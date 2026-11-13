'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { centerSchema } from '@/lib/centers/center-schema'
import { createCenter, updateCenter } from '@/lib/centers/centers'
import { dataGridStateSchema, toPrismaQuery } from '@/lib/grid/grid-query'
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

export const listCentersAction = createAction({
  permission: 'master.centers.read',
  input: dataGridStateSchema,
  handler: async ({ input, scope }) => {
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'systemCode', 'name', 'address'],
      sortable: {
        code: 'code',
        systemCode: 'systemCode',
        name: 'name',
        isActive: 'isActive',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { code: 'asc' },
    })
    // 검색 조건과 데이터 범위 조건을 둘 다 만족 (AND)
    const where = { AND: [query.where, scopeFilter(scope, CENTER_SCOPE)] }
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
          address: true,
          isActive: true,
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
