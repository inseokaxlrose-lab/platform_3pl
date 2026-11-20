'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { acrossOperators, requireOperatorId } from '@/lib/actor'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { dateRangeFilter, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { USER_TYPES } from '@/lib/users/user-schema'
import { overridesIssue } from '@/lib/permissions/override-state'
import { prisma } from '@/lib/prisma'
import { operatorFilter } from '@/lib/scope/data-scope'
import { withIsActive } from '@/lib/status'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import type { CurrentUser } from '@/lib/session'
import { affiliationIssues, internalEmail } from '@/lib/users/affiliation'
import { createUserAccount } from '@/lib/users/create-user-account'
import { createUserSchema, passwordSchema, updateUserSchema } from '@/lib/users/user-schema'
import { resetUserPassword, setUserActive } from '@/lib/users/manage-user'
import { idSchema } from '@/lib/id'
import { toValue } from '@/lib/db-value'
import { USER_TYPE_VALUES } from '@/config/db-codes'

// 사용자 관리 서버 액션 (docs/decisions/0018-user-admin.md)
// 시스템 메뉴는 운영사 관리자만 쓸 수 있다 (권한 계산에서 이미 막지만 서버에서 한 번 더 확인)
// 플랫폼 관리자는 운영사로 작업 중일 때만 운영사 화면 권한이 있으므로 함께 허용한다 (0039)

type UserType = 'OPERATOR' | 'CENTER' | 'SHIPPER'

function requireOperator(user: CurrentUser) {
  if (user.userType !== 'OPERATOR' && user.userType !== 'PLATFORM') {
    throw new ActionError('FORBIDDEN', '사용자 관리는 운영사 사용자만 할 수 있습니다.')
  }
}

// 권한그룹은 사용자 유형에 맞는 영역만 (운영사·센터 → 운영사 화면 그룹, 화주사 → 포털 그룹)
async function assertGroupsMatch(groupIds: bigint[], userType: UserType) {
  if (groupIds.length === 0) return
  const area = userType === 'SHIPPER' ? 'PORTAL' : 'ADMIN'
  const groups = await prisma.permissionGroup.findMany({
    where: { id: { in: groupIds } },
    select: { area: true },
  })
  if (groups.length !== new Set(groupIds).size || groups.some((g) => g.area !== area)) {
    throw new ActionError('VALIDATION', '사용자 유형에 맞지 않는 권한그룹이 있습니다.')
  }
}

function assertAffiliation(userType: UserType, centerIds: bigint[], shipperId?: bigint) {
  const issue = affiliationIssues(userType, centerIds, shipperId)[0]
  if (issue) throw new ActionError('VALIDATION', issue.message)
}

// 이메일·아이디는 운영사와 상관없이 전체에서 하나 → 운영사 거르기를 끄고 검사한다 (0039)
async function assertEmailFree(email: string, exceptUserId?: bigint) {
  const owner = await acrossOperators(() =>
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  )
  if (owner && owner.id !== exceptUserId) {
    throw new ActionError('CONFLICT', '이미 사용 중인 이메일입니다.')
  }
}

// 목록 (검색 조건: 사용자 목록 화면의 searchFields와 같은 키). 엑셀 전체는 엑셀 권한 필요
export const listUsersAction = createAction({
  permission: 'system.users.read',
  input: listQuerySchema,
  handler: async ({ user, input, permissions, scope }) => {
    requireOperator(user)
    if (input.exportAll && !permissions.has('system.users.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['username', 'name', 'email'],
      sortable: {
        username: 'username',
        name: 'name',
        userType: 'userType',
        isActive: 'status',
        createdAt: 'createdAt',
      },
      defaultOrderBy: { username: 'asc' },
    })
    const userType = (USER_TYPES as readonly string[]).includes(filters.userType ?? '')
      ? (filters.userType as (typeof USER_TYPES)[number])
      : undefined
    const createdAt = dateRangeFilter(filters, 'createdAt')
    const where = {
      AND: [
        operatorFilter(scope),
        query.where,
        userType ? { userType } : {},
        statusWhere(filters),
        idFilter(filters, 'group')
          ? { permissionGroups: { some: { groupId: idFilter(filters, 'group') } } }
          : {},
        idFilter(filters, 'center')
          ? { centers: { some: { centerId: idFilter(filters, 'center') } } }
          : {},
        idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
        createdAt ? { createdAt } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.user.findMany({
        ...query,
        where,
        select: {
          id: true,
          username: true,
          displayUsername: true,
          name: true,
          email: true,
          userType: true,
          status: true,
          createdAt: true,
          shipper: { select: { name: true } },
          centers: { select: { center: { select: { name: true } } } },
          permissionGroups: { select: { group: { select: { name: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ])
    return {
      rows: rows.map(withIsActive).map((row) => ({
        id: row.id,
        username: row.displayUsername ?? row.username ?? '',
        name: row.name,
        // 이메일이 없는 사용자의 내부용 주소는 보여주지 않는다
        email: row.email.endsWith('@users.local') ? null : row.email,
        // 운영사 조건으로 걸러 플랫폼 관리자(운영사 없음)는 나오지 않는다
        userType: row.userType as UserType,
        isActive: row.isActive,
        createdAt: row.createdAt,
        affiliation:
          row.shipper?.name ?? (row.centers.map(({ center }) => center.name).join(', ') || null),
        groups: row.permissionGroups.map(({ group }) => group.name).join(', ') || null,
      })),
      rowCount,
    }
  },
})

export const createUserAction = createAction({
  permission: 'system.users.create',
  input: createUserSchema,
  handler: async ({ user, input }) => {
    requireOperator(user)
    assertAffiliation(input.userType, input.centerIds, input.shipperId)
    await assertGroupsMatch(input.permissionGroupIds, input.userType)

    const username = input.username.toLowerCase()
    const taken = await acrossOperators(() =>
      prisma.user.findUnique({ where: { username }, select: { id: true } }),
    )
    if (taken) {
      throw new ActionError('CONFLICT', '이미 사용 중인 아이디입니다.')
    }
    await assertEmailFree(input.email?.toLowerCase() ?? internalEmail(username))

    const created = await createUserAccount({
      operatorId: requireOperatorId(),
      username: input.username,
      password: input.password,
      name: input.name,
      userType: input.userType,
      email: input.email,
      centerIds: input.centerIds,
      shipperId: input.shipperId,
      permissionGroupIds: input.permissionGroupIds,
    })
    return { id: created.id }
  },
})

// 사용자 유형·아이디는 바꿀 수 없다 (유형이 바뀌면 소속·데이터 범위가 통째로 바뀐다)
export const updateUserAction = createAction({
  permission: 'system.users.update',
  input: updateUserSchema,
  handler: async ({ user, input }) => {
    requireOperator(user)
    const found = await prisma.user.findUnique({
      where: { id: input.id },
      select: { userType: true, username: true, rowVersion: true },
    })
    assertRowVersion(found, input.rowVersion, '사용자를 찾을 수 없습니다.')
    const target = found!
    // 플랫폼 관리자는 운영사가 없어 여기서 찾아지지 않는다 (타입을 좁히기 위한 확인)
    if (target.userType === 'PLATFORM')
      throw new ActionError('NOT_FOUND', '사용자를 찾을 수 없습니다.')
    const userType = toValue(USER_TYPES, target.userType)

    assertAffiliation(userType, input.centerIds, input.shipperId)
    await assertGroupsMatch(input.permissionGroupIds, userType)
    const email = input.email?.toLowerCase() ?? internalEmail(target.username ?? String(input.id))
    await assertEmailFree(email, input.id)

    return prisma.$transaction(async (tx) => {
      const saved = await withVersionGuard(() =>
        tx.user.update({
          where: { id: input.id, rowVersion: input.rowVersion },
          data: { name: input.name, email, shipperId: input.shipperId ?? null },
          select: { id: true, rowVersion: true },
        }),
      )
      await tx.userCenter.deleteMany({ where: { userId: input.id } })
      await tx.userCenter.createMany({
        data: [...new Set(input.centerIds)].map((centerId) => ({ userId: input.id, centerId })),
      })
      await tx.userPermissionGroup.deleteMany({ where: { userId: input.id } })
      await tx.userPermissionGroup.createMany({
        data: [...new Set(input.permissionGroupIds)].map((groupId) => ({
          userId: input.id,
          groupId,
        })),
      })
      return saved
    })
  },
})

export const setUserActiveAction = createAction({
  permission: 'system.users.update',
  input: z.object({ id: idSchema, isActive: z.boolean() }),
  handler: async ({ user, input }) => {
    requireOperator(user)
    if (input.id === user.id && !input.isActive) {
      throw new ActionError('CONFLICT', '자기 자신은 사용 중지할 수 없습니다.')
    }
    if (!(await prisma.user.findUnique({ where: { id: input.id }, select: { id: true } }))) {
      throw new ActionError('NOT_FOUND', '사용자를 찾을 수 없습니다.')
    }
    await setUserActive(input.id, input.isActive)
    return { id: input.id, isActive: input.isActive }
  },
})

// 여러 사용자 한꺼번에 사용 중지 / 다시 사용 (목록 일괄 처리). 사용 중지하면 기존 로그인을 끊는다
// 자기 자신이 섞여 있으면 사용 중지를 거부, 없는 사용자가 섞이면 전체 거부
export const setUsersActiveAction = createAction({
  permission: 'system.users.update',
  input: z.object({ ids: z.array(idSchema).min(1).max(200), isActive: z.boolean() }),
  handler: async ({ user, input }) => {
    requireOperator(user)
    const ids = [...new Set(input.ids)]
    if (!input.isActive && ids.includes(user.id)) {
      throw new ActionError('CONFLICT', '자기 자신은 사용 중지할 수 없습니다.')
    }
    const found = await prisma.user.count({ where: { id: { in: ids } } })
    if (found !== ids.length) {
      throw new ActionError('NOT_FOUND', '찾을 수 없는 사용자가 섞여 있습니다.')
    }
    for (const id of ids) await setUserActive(id, input.isActive)
    return { count: ids.length }
  },
})

export const resetUserPasswordAction = createAction({
  permission: 'system.users.update',
  input: z
    .object({ id: idSchema, password: passwordSchema, passwordConfirm: z.string() })
    .refine((data) => data.password === data.passwordConfirm, {
      path: ['passwordConfirm'],
      message: '비밀번호가 서로 다릅니다.',
    }),
  handler: async ({ user, input }) => {
    requireOperator(user)
    if (!(await prisma.user.findUnique({ where: { id: input.id }, select: { id: true } }))) {
      throw new ActionError('NOT_FOUND', '사용자를 찾을 수 없습니다.')
    }
    await resetUserPassword(input.id, input.password)
    return { id: input.id }
  },
})

// 사용자별 추가·제외 권한 저장 (0019): 기존 목록을 지우고 새로 넣는다 (한 트랜잭션)
// 자기 자신은 바꿀 수 없다: 실수로 자기 시스템 권한을 빼서 잠기거나, 스스로 권한을 올리는 것을 막는다
export const updateUserOverridesAction = createAction({
  permission: 'system.users.update',
  input: z.object({
    id: idSchema,
    grants: z.array(z.string().min(1)).max(500),
    denies: z.array(z.string().min(1)).max(500),
  }),
  handler: async ({ user, input }) => {
    requireOperator(user)
    if (input.id === user.id) {
      throw new ActionError('CONFLICT', '자기 자신의 개별 권한은 바꿀 수 없습니다.')
    }
    const target = await prisma.user.findUnique({
      where: { id: input.id },
      select: { userType: true },
    })
    if (!target) throw new ActionError('NOT_FOUND', '사용자를 찾을 수 없습니다.')

    const grants = [...new Set(input.grants)]
    const denies = [...new Set(input.denies)]
    const issue = overridesIssue(toValue(USER_TYPE_VALUES, target.userType), grants, denies)
    if (issue) throw new ActionError('VALIDATION', issue)

    await prisma.$transaction([
      prisma.userPermissionOverride.deleteMany({ where: { userId: input.id } }),
      prisma.userPermissionOverride.createMany({
        data: [
          ...grants.map((permissionCode) => ({
            userId: input.id,
            permissionCode,
            effect: 'GRANT' as const,
          })),
          ...denies.map((permissionCode) => ({
            userId: input.id,
            permissionCode,
            effect: 'DENY' as const,
          })),
        ],
      }),
    ])
    return { id: input.id, grants: grants.length, denies: denies.length }
  },
})
