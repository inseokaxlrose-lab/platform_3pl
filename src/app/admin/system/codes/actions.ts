'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import {
  createCodeGroup,
  createCodeItem,
  deleteCodeGroup,
  deleteCodeItem,
  restoreCodeGroup,
  restoreCodeItem,
  updateCodeGroup,
  updateCodeItem,
} from '@/lib/common-code/code-admin'
import {
  codeGroupCreateSchema,
  codeGroupUpdateSchema,
  codeItemCreateSchema,
  codeItemUpdateSchema,
} from '@/lib/common-code/code-schema'
import { dataGridStateSchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { prisma } from '@/lib/prisma'
import { DELETED_ONLY, NOT_DELETED, withIsActive } from '@/lib/status'
import { isYes } from '@/lib/yn'
import { idSchema } from '@/lib/id'

// 공통코드 관리 서버 액션 (docs/decisions/0030)
// 시스템 데이터라 데이터 범위가 없다. 시스템 메뉴라 운영사 사용자만 권한을 가질 수 있다 (0018)

const idInput = z.object({ id: idSchema })

export const listCodeGroupsAction = createAction({
  permission: 'system.codes.read',
  input: dataGridStateSchema,
  handler: async ({ input }) => {
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'name'],
      sortable: { code: 'code', name: 'name', sortOrder: 'sortOrder', isActive: 'status' },
      defaultOrderBy: { code: 'asc' },
    })
    const [rows, rowCount] = await prisma.$transaction([
      prisma.codeGroup.findMany({
        ...query,
        orderBy: input.sorting.length > 0 ? query.orderBy : [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          sortOrder: true,
          status: true,
          rowVersion: true,
          isSystem: true,
          _count: { select: { items: { where: NOT_DELETED } } },
        },
      }),
      prisma.codeGroup.count({ where: query.where }),
    ])
    return {
      // 예/아니오 칸은 화면에서 true/false로
      rows: rows.map(withIsActive).map(({ _count, ...row }) => ({
        ...row,
        isSystem: isYes(row.isSystem),
        itemCount: _count.items,
      })),
      rowCount,
    }
  },
})

export const listCodeItemsAction = createAction({
  permission: 'system.codes.read',
  input: dataGridStateSchema.extend({ groupId: idSchema }),
  handler: async ({ input: { groupId, ...state } }) => {
    const query = toPrismaQuery(state, {
      searchFields: ['code', 'name'],
      sortable: { code: 'code', name: 'name', sortOrder: 'sortOrder', isActive: 'status' },
      defaultOrderBy: { code: 'asc' },
    })
    const where = { AND: [query.where, { groupId }] }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.codeItem.findMany({
        ...query,
        where,
        orderBy: state.sorting.length > 0 ? query.orderBy : [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          sortOrder: true,
          status: true,
          rowVersion: true,
          updatedAt: true,
        },
      }),
      prisma.codeItem.count({ where }),
    ])
    return { rows: rows.map(withIsActive), rowCount }
  },
})

export const createCodeGroupAction = createAction({
  permission: 'system.codes.create',
  input: codeGroupCreateSchema,
  handler: ({ input }) => createCodeGroup(input),
})

export const updateCodeGroupAction = createAction({
  permission: 'system.codes.update',
  input: codeGroupUpdateSchema,
  handler: ({ input }) => updateCodeGroup(input),
})

export const deleteCodeGroupAction = createAction({
  permission: 'system.codes.delete',
  input: idInput,
  handler: ({ input }) => deleteCodeGroup(input.id),
})

export const createCodeItemAction = createAction({
  permission: 'system.codes.create',
  input: codeItemCreateSchema,
  handler: ({ input }) => createCodeItem(input),
})

export const updateCodeItemAction = createAction({
  permission: 'system.codes.update',
  input: codeItemUpdateSchema,
  handler: ({ input }) => updateCodeItem(input),
})

export const deleteCodeItemAction = createAction({
  permission: 'system.codes.delete',
  input: idInput,
  handler: ({ input }) => deleteCodeItem(input.id),
})

// 되살리기: 지운 코드 그룹·코드 (삭제 권한). 같은 코드가 다시 생겼으면 거부
export const restoreCodeGroupAction = createAction({
  permission: 'system.codes.delete',
  input: idInput,
  handler: ({ input }) => restoreCodeGroup(input.id),
})

export const restoreCodeItemAction = createAction({
  permission: 'system.codes.delete',
  input: idInput,
  handler: ({ input }) => restoreCodeItem(input.id),
})

// 지운 코드 그룹·코드 목록 (되살리기 팝업용, 삭제 권한). 최근에 지운 것부터 최대 200개씩
export const listDeletedCodesAction = createAction({
  permission: 'system.codes.delete',
  input: z.object({}),
  handler: async () => {
    const [groups, items] = await Promise.all([
      prisma.codeGroup.findMany({
        where: DELETED_ONLY,
        select: { id: true, code: true, name: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      prisma.codeItem.findMany({
        where: DELETED_ONLY,
        select: {
          id: true,
          code: true,
          name: true,
          updatedAt: true,
          group: { select: { code: true, name: true, delYn: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    ])
    return {
      groups,
      items: items.map(({ group, ...item }) => ({
        ...item,
        groupLabel: `${group.name} (${group.code})`,
        // 그룹도 지워졌으면 그룹을 먼저 되살려야 한다
        groupDeleted: isYes(group.delYn),
      })),
    }
  },
})
