'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { UNIT_KINDS } from '@/lib/units/unit-labels'
import { unitCreateSchema, unitUpdateSchema } from '@/lib/units/unit-schema'
import { createUnit, deleteUnits, setUnitsActive, updateUnit } from '@/lib/units/units'
import { idSchema } from '@/lib/id'

// 단위 관리 서버 액션 (docs/decisions/0034)
// 단위는 전체 공통 기준정보라 데이터 범위(센터·화주사)를 적용하지 않는다

const idsSchema = z.array(idSchema).min(1).max(200)

// 목록 (검색 조건: 단위 목록 화면의 searchFields와 같은 키 — kind·status)
export const listUnitsAction = createAction({
  permission: 'master.units.read',
  input: listQuerySchema,
  handler: async ({ input }) => {
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'name'],
      sortable: {
        code: 'code',
        name: 'name',
        kind: 'kind',
        sortOrder: 'sortOrder',
        isActive: 'isActive',
      },
      defaultOrderBy: { sortOrder: 'asc' },
    })
    const kind = (UNIT_KINDS as readonly string[]).includes(filters.kind ?? '')
      ? (filters.kind as (typeof UNIT_KINDS)[number])
      : undefined
    const where = {
      AND: [
        query.where,
        kind ? { kind } : {},
        filters.status === 'ACTIVE' ? { isActive: true } : {},
        filters.status === 'INACTIVE' ? { isActive: false } : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.unit.findMany({
        ...query,
        // 정렬을 고르지 않으면 종류(기본 → 환산) → 정렬 순서
        orderBy:
          input.sorting.length > 0
            ? query.orderBy
            : [{ kind: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
        where,
        select: {
          id: true,
          code: true,
          name: true,
          kind: true,
          decimals: true,
          sortOrder: true,
          isActive: true,
          isSystem: true,
          updatedAt: true,
        },
      }),
      prisma.unit.count({ where }),
    ])
    // 외부 코드도 목록에 (수정 팝업을 채우고 숨김 컬럼으로 보여준다)
    const withCodes = await Promise.all(
      rows.map(async (row) => ({ ...row, externalCodes: await getExternalCodes('UNIT', row.id) })),
    )
    return { rows: withCodes, rowCount }
  },
})

export const createUnitAction = createAction({
  permission: 'master.units.create',
  input: unitCreateSchema,
  handler: ({ input }) => createUnit(input),
})

export const updateUnitAction = createAction({
  permission: 'master.units.update',
  input: unitUpdateSchema,
  handler: ({ input }) => updateUnit(input),
})

export const setUnitsActiveAction = createAction({
  permission: 'master.units.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: ({ input }) => setUnitsActive(input.ids, input.isActive),
})

export const deleteUnitsAction = createAction({
  permission: 'master.units.delete',
  input: z.object({ ids: idsSchema }),
  handler: ({ input }) => deleteUnits(input.ids),
})
