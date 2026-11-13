'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { dataGridStateSchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { normalizeGroupCodes, toPermissionArea } from '@/lib/permissions/normalize-group-codes'
import { prisma } from '@/lib/prisma'

// 권한그룹 관리 서버 액션 (docs/decisions/0017-permission-group-admin.md)
// 권한그룹은 운영사 전체 설정이라 데이터 범위(센터·화주사)를 적용하지 않는다

const nameSchema = z
  .string()
  .trim()
  .min(1, '이름을 입력해 주세요.')
  .max(50, '50자 이하로 입력해 주세요.')
const descriptionSchema = z.string().trim().max(200, '200자 이하로 입력해 주세요.').optional()
const codesSchema = z.array(z.string().max(100)).max(500)

// 이름 중복(DB 고유 조건) → 사용자 안내
function isUniqueViolation(error: unknown) {
  return (error as { code?: string })?.code === 'P2002'
}

export const listPermissionGroupsAction = createAction({
  permission: 'system.roles.read',
  input: dataGridStateSchema,
  handler: async ({ input }) => {
    const query = toPrismaQuery(input, {
      searchFields: ['name', 'description'],
      sortable: { name: 'name', area: 'area', updatedAt: 'updatedAt' },
      defaultOrderBy: { name: 'asc' },
    })
    const [rows, rowCount] = await prisma.$transaction([
      prisma.permissionGroup.findMany({
        ...query,
        select: {
          id: true,
          name: true,
          area: true,
          description: true,
          updatedAt: true,
          _count: { select: { permissions: true, users: true } },
        },
      }),
      prisma.permissionGroup.count({ where: query.where }),
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
  input: z.object({
    name: nameSchema,
    area: z.enum(['ADMIN', 'PORTAL']),
    description: descriptionSchema,
    permissionCodes: codesSchema,
  }),
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
  input: z.object({
    id: z.string().min(1),
    name: nameSchema,
    description: descriptionSchema,
    permissionCodes: codesSchema,
  }),
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
  input: z.object({ id: z.string().min(1) }),
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
