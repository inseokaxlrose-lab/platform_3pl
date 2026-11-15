'use server'

import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter, digitsFilter } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { asOperator } from '@/lib/actor'
import { changeOperatorStatus, saveOperator } from '@/lib/operator/operator'
import {
  clearCorpRegNo,
  operatorObject,
  operatorRegisterSchema,
  operatorStatusSchema,
} from '@/lib/operator/operator-schema'
import { rowVersionField } from '@/lib/row-version'
import type { CurrentUser } from '@/lib/session'
import { OPERATOR_STATUS, OPERATOR_TYPE } from '@/config/operator-codes'
import { NOT_DELETED } from '@/lib/status'
import { registerOperator } from '@/lib/operator/register-operator'
import { setActingOperatorCookie } from '@/lib/platform/acting-operator-cookie'
import { prisma } from '@/lib/prisma'
import { passwordSchema } from '@/lib/users/user-schema'
import { z } from 'zod'

// 플랫폼 · 운영사 (docs/decisions/0039)
// 운영사 표(tb_operator)는 운영사 데이터가 아니라 운영사 자체라 운영사 거르기가 없다 → 플랫폼 권한으로만 막는다
// (정의서의 전체 목록·상태 변경 팝업은 M2.5 4단계에서)

// 플랫폼 권한은 플랫폼 관리자만 받지만, 서버에서 한 번 더 확인한다
function requirePlatform(user: CurrentUser) {
  if (user.userType !== 'PLATFORM') {
    throw new ActionError('FORBIDDEN', '플랫폼 관리자만 할 수 있습니다.')
  }
}

// 목록 (정의서 "4. 운영사 목록 화면 반영", 검색 조건 키는 운영사 목록 화면의 searchFields와 같게)
// 기본: 통합검색(운영사코드·운영사명)·사업자등록번호·운영 상태(여러 개) / 상세: 운영사 유형(여러 개)·등록일
// 센터 수·화주 수는 칸으로 두지 않고 조회할 때 센다 (지운 것 제외)
export const listOperatorsAction = createAction({
  permission: 'platform.operators.read',
  input: listQuerySchema,
  handler: async ({ input }) => {
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'name'],
      sortable: {
        code: 'code',
        name: 'name',
        status: 'status',
        type: 'type',
        plan: 'plan',
        contractEndOn: 'contractEndOn',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { createdAt: 'desc' },
    })
    // 값 목록에 있는 코드만 조건으로 (모르는 값은 버린다)
    const known = (set: { has: (v: string) => boolean }, key: string) => {
      const codes = codesFilter(filters, key)?.in.filter((code) => set.has(code)) ?? []
      return codes.length > 0 ? { in: codes } : undefined
    }
    const status = known(OPERATOR_STATUS, 'status')
    const type = known(OPERATOR_TYPE, 'type')
    const businessNumber = digitsFilter(filters, 'businessNumber')
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const where = {
      AND: [
        query.where,
        status ? { status } : {},
        type ? { type } : {},
        businessNumber ? { businessNumber } : {},
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.operator.findMany({
        ...query,
        where,
        select: {
          id: true,
          code: true,
          name: true,
          businessNumber: true,
          ceoName: true,
          phone: true,
          status: true,
          type: true,
          plan: true,
          contractEndOn: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              centers: { where: NOT_DELETED },
              shippers: { where: NOT_DELETED },
              users: true,
            },
          },
        },
      }),
      prisma.operator.count({ where }),
    ])
    return {
      rows: rows.map(({ _count, ...row }) => ({
        ...row,
        centerCount: _count.centers,
        shipperCount: _count.shippers,
        userCount: _count.users,
      })),
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
    requirePlatform(user)
    const operator = await prisma.operator.findUnique({
      where: { id: input.id },
      select: { id: true, name: true },
    })
    if (!operator) throw new ActionError('NOT_FOUND', '운영사를 찾을 수 없습니다.')
    await setActingOperatorCookie(operator.id)
    return operator
  },
})

// 운영사 등록: 운영사 + 기본값 + 관리자 계정(admin.○○)을 한 번에 (0039 3c)
// 관리자의 처음 비밀번호는 서버 설정(.env SEED_ADMIN_PASSWORD) — 화면으로 보내지 않는다
export const createOperatorAction = createAction({
  permission: 'platform.operators.create',
  input: operatorRegisterSchema,
  handler: async ({ user, input }) => {
    requirePlatform(user)
    const password = passwordSchema.safeParse(process.env.SEED_ADMIN_PASSWORD ?? '')
    if (!password.success) {
      throw new ActionError(
        'VALIDATION',
        '관리자 처음 비밀번호가 서버에 설정되지 않았습니다. (.env의 SEED_ADMIN_PASSWORD)',
      )
    }
    return registerOperator(input, password.data)
  },
})

// 운영사 정보 수정 (플랫폼 편집 화면, 0040): 유형까지 고칠 수 있다 (운영사코드는 바꿀 수 없다)
// 담당 업무는 그 운영사의 공통코드로 검사해야 하므로 대상 운영사의 출입증으로 저장한다
export const updateOperatorAction = createAction({
  permission: 'platform.operators.update',
  input: operatorObject.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ user, input: { id, rowVersion, ...data } }) => {
    requirePlatform(user)
    return asOperator(id, () => saveOperator(id, clearCorpRegNo(data), rowVersion))
  },
})

// 운영 상태 변경 (플랫폼, 상태변경 팝업): 정지·해지는 사유 필수
export const changeOperatorStatusAction = createAction({
  permission: 'platform.operators.update',
  input: operatorStatusSchema,
  handler: async ({ user, input }) => {
    requirePlatform(user)
    return changeOperatorStatus(input.id, input.rowVersion, input.status, input.reason)
  },
})
