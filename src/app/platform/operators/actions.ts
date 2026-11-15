'use server'

import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { dateRangeFilter } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { OPERATOR_STATUSES } from '@/lib/operator/operator-status'
import { setActingOperatorCookie } from '@/lib/platform/acting-operator-cookie'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// 플랫폼 · 운영사 (docs/decisions/0039)
// 운영사 표(tb_operator)는 운영사 데이터가 아니라 운영사 자체라 운영사 거르기가 없다 → 플랫폼 권한으로만 막는다
// (정의서의 전체 목록·상태 변경 팝업은 M2.5 4단계에서)

// 목록 (검색 조건: 운영사 목록 화면의 searchFields와 같은 키 — keyword·status·createdAt)
export const listOperatorsAction = createAction({
  permission: 'platform.operators.read',
  input: listQuerySchema,
  handler: async ({ input }) => {
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['name', 'businessNumber'],
      sortable: { name: 'name', status: 'status', createdAt: 'createdAt' },
      defaultOrderBy: { createdAt: 'desc' },
    })
    const status = (OPERATOR_STATUSES as readonly string[]).includes(filters.status ?? '')
      ? filters.status
      : undefined
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const where = {
      AND: [query.where, status ? { status } : {}, createdAt ? { createdAt } : {}],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.operator.findMany({
        ...query,
        where,
        select: {
          id: true,
          name: true,
          businessNumber: true,
          status: true,
          createdAt: true,
          _count: { select: { users: true } },
        },
      }),
      prisma.operator.count({ where }),
    ])
    return {
      rows: rows.map(({ _count, ...row }) => ({ ...row, userCount: _count.users })),
      rowCount,
    }
  },
})

// 이 운영사로 작업: 전환 쿠키를 두고, 화면은 운영사 화면(/admin)으로 이동한다
// 상태와 상관없이 전환할 수 있다 (대기 운영사의 초기 설정, 정지 운영사의 확인을 플랫폼이 대신 하도록)
export const switchOperatorAction = createAction({
  permission: 'platform.operators.switch',
  input: z.object({ id: idSchema }),
  handler: async ({ user, input }) => {
    // 권한 계산에서 이미 플랫폼 관리자만 이 권한을 갖지만, 서버에서 한 번 더 확인한다
    if (user.userType !== 'PLATFORM') {
      throw new ActionError('FORBIDDEN', '플랫폼 관리자만 운영사로 전환할 수 있습니다.')
    }
    const operator = await prisma.operator.findUnique({
      where: { id: input.id },
      select: { id: true, name: true },
    })
    if (!operator) throw new ActionError('NOT_FOUND', '운영사를 찾을 수 없습니다.')
    await setActingOperatorCookie(operator.id)
    return operator
  },
})
