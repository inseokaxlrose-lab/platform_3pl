'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { dataGridStateSchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { prisma } from '@/lib/prisma'
import type { CurrentUser } from '@/lib/session'
import { affiliationIssues, internalEmail } from '@/lib/users/affiliation'
import { createUserAccount, passwordSchema, usernameSchema } from '@/lib/users/create-user-account'
import { resetUserPassword, setUserActive } from '@/lib/users/manage-user'

// 사용자 관리 서버 액션 (docs/decisions/0018-user-admin.md)
// 시스템 메뉴는 운영사만 쓸 수 있다 (권한 계산에서 이미 막지만 서버에서 한 번 더 확인)

type UserType = 'OPERATOR' | 'CENTER' | 'SHIPPER'

function requireOperator(user: CurrentUser) {
  if (user.userType !== 'OPERATOR') {
    throw new ActionError('FORBIDDEN', '사용자 관리는 운영사 사용자만 할 수 있습니다.')
  }
}

const nameSchema = z.string().trim().min(1, '이름을 입력해 주세요.').max(50)
const emailSchema = z
  .union([z.literal(''), z.email('이메일 형식이 아닙니다.')])
  .optional()
  .transform((value) => value || undefined)
const affiliationShape = {
  centerIds: z.array(z.string().min(1)).max(50).default([]),
  shipperId: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  permissionGroupIds: z.array(z.string().min(1)).max(50).default([]),
}

// 권한그룹은 사용자 유형에 맞는 영역만 (운영사·센터 → 운영사 화면 그룹, 화주사 → 포털 그룹)
async function assertGroupsMatch(groupIds: string[], userType: UserType) {
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

function assertAffiliation(userType: UserType, centerIds: string[], shipperId?: string) {
  const issue = affiliationIssues(userType, centerIds, shipperId)[0]
  if (issue) throw new ActionError('VALIDATION', issue.message)
}

async function assertEmailFree(email: string, exceptUserId?: string) {
  const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (owner && owner.id !== exceptUserId) {
    throw new ActionError('CONFLICT', '이미 사용 중인 이메일입니다.')
  }
}

export const listUsersAction = createAction({
  permission: 'system.users.read',
  input: dataGridStateSchema,
  handler: async ({ user, input }) => {
    requireOperator(user)
    const query = toPrismaQuery(input, {
      searchFields: ['username', 'name', 'email'],
      sortable: {
        username: 'username',
        name: 'name',
        userType: 'userType',
        isActive: 'isActive',
        createdAt: 'createdAt',
      },
      defaultOrderBy: { username: 'asc' },
    })
    const [rows, rowCount] = await prisma.$transaction([
      prisma.user.findMany({
        ...query,
        select: {
          id: true,
          username: true,
          displayUsername: true,
          name: true,
          userType: true,
          isActive: true,
          createdAt: true,
          shipper: { select: { name: true } },
          centers: { select: { center: { select: { name: true } } } },
          permissionGroups: { select: { group: { select: { name: true } } } },
        },
      }),
      prisma.user.count({ where: query.where }),
    ])
    return {
      rows: rows.map((row) => ({
        id: row.id,
        username: row.displayUsername ?? row.username ?? '',
        name: row.name,
        userType: row.userType,
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
  input: z
    .object({
      username: usernameSchema,
      name: nameSchema,
      userType: z.enum(['OPERATOR', 'CENTER', 'SHIPPER']),
      email: emailSchema,
      password: passwordSchema,
      passwordConfirm: z.string(),
      ...affiliationShape,
    })
    .refine((data) => data.password === data.passwordConfirm, {
      path: ['passwordConfirm'],
      message: '비밀번호가 서로 다릅니다.',
    }),
  handler: async ({ user, input }) => {
    requireOperator(user)
    assertAffiliation(input.userType, input.centerIds, input.shipperId)
    await assertGroupsMatch(input.permissionGroupIds, input.userType)

    const username = input.username.toLowerCase()
    if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
      throw new ActionError('CONFLICT', '이미 사용 중인 아이디입니다.')
    }
    await assertEmailFree(input.email?.toLowerCase() ?? internalEmail(username))

    const created = await createUserAccount({
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
  input: z.object({
    id: z.string().min(1),
    name: nameSchema,
    email: emailSchema,
    ...affiliationShape,
  }),
  handler: async ({ user, input }) => {
    requireOperator(user)
    const target = await prisma.user.findUnique({
      where: { id: input.id },
      select: { userType: true, username: true },
    })
    if (!target) throw new ActionError('NOT_FOUND', '사용자를 찾을 수 없습니다.')

    assertAffiliation(target.userType, input.centerIds, input.shipperId)
    await assertGroupsMatch(input.permissionGroupIds, target.userType)
    const email = input.email?.toLowerCase() ?? internalEmail(target.username ?? input.id)
    await assertEmailFree(email, input.id)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: input.id },
        data: { name: input.name, email, shipperId: input.shipperId ?? null },
      }),
      prisma.userCenter.deleteMany({ where: { userId: input.id } }),
      prisma.userCenter.createMany({
        data: [...new Set(input.centerIds)].map((centerId) => ({ userId: input.id, centerId })),
      }),
      prisma.userPermissionGroup.deleteMany({ where: { userId: input.id } }),
      prisma.userPermissionGroup.createMany({
        data: [...new Set(input.permissionGroupIds)].map((groupId) => ({
          userId: input.id,
          groupId,
        })),
      }),
    ])
    return { id: input.id }
  },
})

export const setUserActiveAction = createAction({
  permission: 'system.users.update',
  input: z.object({ id: z.string().min(1), isActive: z.boolean() }),
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

export const resetUserPasswordAction = createAction({
  permission: 'system.users.update',
  input: z
    .object({ id: z.string().min(1), password: passwordSchema, passwordConfirm: z.string() })
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
