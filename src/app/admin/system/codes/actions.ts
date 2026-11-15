'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import {
  createCodeGroup,
  createCodeItem,
  deleteCodeGroup,
  deleteCodeItem,
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
      sortable: { code: 'code', name: 'name', sortOrder: 'sortOrder', isActive: 'isActive' },
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
          isActive: true,
          rowVersion: true,
          isSystem: true,
          _count: { select: { items: true } },
        },
      }),
      prisma.codeGroup.count({ where: query.where }),
    ])
    return {
      // 예/아니오 칸은 화면에서 true/false로
      rows: rows.map(({ _count, ...row }) => ({
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
      sortable: { code: 'code', name: 'name', sortOrder: 'sortOrder', isActive: 'isActive' },
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
          isActive: true,
          rowVersion: true,
          updatedAt: true,
        },
      }),
      prisma.codeItem.count({ where }),
    ])
    return { rows, rowCount }
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
