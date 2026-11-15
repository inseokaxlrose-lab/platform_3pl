'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { normalizeGroupCodes, toPermissionArea } from '@/lib/permissions/normalize-group-codes'
import { ROLE_AREAS, roleSchema, updateRoleSchema } from '@/lib/permissions/role-schema'
import { prisma } from '@/lib/prisma'
import { idSchema } from '@/lib/id'

// 권한그룹 관리 서버 액션 (docs/decisions/0017-permission-group-admin.md)
// 권한그룹은 운영사 전체 설정이라 데이터 범위(센터·화주사)를 적용하지 않는다

// 이름 중복(DB 고유 조건) → 사용자 안내
function isUniqueViolation(error: unknown) {
  return (error as { code?: string })?.code === 'P2002'
}

export const listPermissionGroupsAction = createAction({
  permission: 'system.roles.read',
  input: listQuerySchema,
  handler: async ({ input }) => {
    const query = toPrismaQuery(input, {
      searchFields: ['name', 'description'],
      sortable: { name: 'name', area: 'area', updatedAt: 'updatedAt' },
      defaultOrderBy: { name: 'asc' },
    })
    // 검색 조건: 영역 (권한그룹 목록 화면의 searchFields와 같은 키)
    const area = (ROLE_AREAS as readonly string[]).includes(input.filters.area ?? '')
      ? (input.filters.area as (typeof ROLE_AREAS)[number])
      : undefined
    const where = { AND: [query.where, area ? { area } : {}] }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.permissionGroup.findMany({
        ...query,
        where,
        select: {
          id: true,
          name: true,
          area: true,
          description: true,
          updatedAt: true,
          _count: { select: { permissions: true, users: true } },
        },
      }),
      prisma.permissionGroup.count({ where }),
    ])
    return {
      rows: rows.map(({ _count, ...row }) => ({
        ...row,
        permissionCount: _count.permissions,
        userCount: _count.users,
      })),
      rowCount,
    }
  },
})

export const createPermissionGroupAction = createAction({
  permission: 'system.roles.create',
  input: roleSchema,
  handler: async ({ input }) => {
    const { codes } = normalizeGroupCodes(input.permissionCodes, toPermissionArea(input.area))
    try {
      const group = await prisma.permissionGroup.create({
        data: {
          name: input.name,
          area: input.area,
          description: input.description || null,
          permissions: { create: codes.map((permissionCode) => ({ permissionCode })) },
        },
        select: { id: true },
      })
      return group
    } catch (error) {
      if (isUniqueViolation(error)) throw new ActionError('CONFLICT', '이미 있는 이름입니다.')
      throw error
    }
  },
})

// 영역(area)은 등록 후 바꿀 수 없다: 바꾸면 체크한 권한이 모두 의미 없어진다
export const updatePermissionGroupAction = createAction({
  permission: 'system.roles.update',
  input: updateRoleSchema,
  handler: async ({ input }) => {
    const group = await prisma.permissionGroup.findUnique({
      where: { id: input.id },
      select: { area: true },
    })
    if (!group) throw new ActionError('NOT_FOUND', '권한그룹을 찾을 수 없습니다.')

    const { codes } = normalizeGroupCodes(input.permissionCodes, toPermissionArea(group.area))
    try {
      await prisma.$transaction([
        prisma.permissionGroup.update({
          where: { id: input.id },
          data: { name: input.name, description: input.description || null },
        }),
        // 권한 목록을 통째로 바꾼다 (목록에서 사라진 옛 코드도 이때 정리된다)
        prisma.permissionGroupPermission.deleteMany({ where: { groupId: input.id } }),
        prisma.permissionGroupPermission.createMany({
          data: codes.map((permissionCode) => ({ groupId: input.id, permissionCode })),
        }),
      ])
    } catch (error) {
      if (isUniqueViolation(error)) throw new ActionError('CONFLICT', '이미 있는 이름입니다.')
      throw error
    }
    return { id: input.id }
  },
})

export const deletePermissionGroupAction = createAction({
  permission: 'system.roles.delete',
  input: z.object({ id: idSchema }),
  handler: async ({ input }) => {
    const group = await prisma.permissionGroup.findUnique({
      where: { id: input.id },
      select: { _count: { select: { users: true } } },
    })
    if (!group) throw new ActionError('NOT_FOUND', '권한그룹을 찾을 수 없습니다.')
    // 사용자가 남은 그룹은 지울 수 없다 (DB도 Restrict로 막지만, 이유를 알려주기 위해 먼저 확인)
    if (group._count.users > 0) {
      throw new ActionError(
        'CONFLICT',
        `사용자 ${group._count.users}명이 이 권한그룹을 사용 중입니다. 먼저 사용자에게서 그룹을 빼 주세요.`,
      )
    }
    await prisma.permissionGroup.delete({ where: { id: input.id } })
    return { id: input.id }
  },
})
