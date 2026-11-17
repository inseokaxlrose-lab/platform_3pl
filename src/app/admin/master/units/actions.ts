'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, deletedWhere, ynFilter } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { sharedOperatorFilter } from '@/lib/scope/data-scope'
import { requireOperatorId } from '@/lib/actor'
import { UNIT_TYPES, type UnitTypeValue } from '@/lib/units/unit-labels'
import { isUnitActive, unitStatusFilter, unitStatusSelect } from '@/lib/units/unit-status'
import { unitCreateSchema, unitUpdateSchema } from '@/lib/units/unit-schema'
import {
  createUnit,
  deleteUnits,
  restoreUnits,
  setUnitsActive,
  updateUnit,
} from '@/lib/units/units'
import { isYes } from '@/lib/yn'

// 단위 관리 서버 액션 (docs/decisions/0034·0078)
// 목록은 시스템 기본 단위 + 이 운영사의 추가 단위. 데이터 범위(센터·화주사)는 없다

const idsSchema = z.array(idSchema).min(1).max(200)

// 목록 (검색 조건: 단위 목록 화면의 searchFields와 같은 키 — type·status·system)
export const listUnitsAction = createAction({
  permission: 'master.units.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) => {
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['code', 'name', 'nameEn'],
      sortable: {
        code: 'code',
        name: 'name',
        type: 'type',
        sortOrder: 'sortOrder',
        isActive: 'status',
        updatedAt: 'updatedAt',
      },
      defaultOrderBy: { sortOrder: 'asc' },
    })
    const types = (codesFilter(filters, 'type')?.in ?? []).filter((t): t is UnitTypeValue =>
      (UNIT_TYPES as readonly string[]).includes(t),
    )
    const system = ynFilter(filters, 'system')
    const operatorId = requireOperatorId()
    const where = {
      // '삭제됨'을 고르면 지운 것만 (아니면 prisma.ts가 지운 것을 뺀다)
      AND: [
        sharedOperatorFilter(scope),
        query.where,
        types.length > 0 ? { type: { in: types } } : {},
        system ? { isSystem: system } : {},
        // 실제 상태: 시스템 단위는 이 운영사의 설정 (0079)
        unitStatusFilter(operatorId, filters.status),
        deletedWhere(filters),
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.unit.findMany({
        ...query,
        // 정렬을 고르지 않으면 단위 유형 → 정렬 순서 → 코드
        orderBy:
          input.sorting.length > 0
            ? query.orderBy
            : [{ type: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
        where,
        select: {
          id: true,
          code: true,
          name: true,
          nameEn: true,
          type: true,
          decimals: true,
          sortOrder: true,
          ...unitStatusSelect(operatorId),
          isSystem: true,
          isBase: true,
          baseFactor: true,
          stdCode: true,
          baseUnit: { select: { code: true } },
          updatedAt: true,
        },
      }),
      prisma.unit.count({ where }),
    ])
    const shaped = rows.map(
      ({
        baseUnit,
        baseFactor,
        isSystem,
        isBase,
        status,
        operatorId: owner,
        operatorSettings,
        ...row
      }) => ({
        ...row,
        isActive: isUnitActive({ status, operatorId: owner, operatorSettings }),
        // 예/아니오 칸은 화면에서 true/false로, 소수는 글자로 (끝의 0 정리는 화면 표시에서)
        isSystem: isYes(isSystem),
        isBase: isYes(isBase),
        baseCode: baseUnit?.code ?? null,
        baseFactor: baseFactor?.toString() ?? null,
      }),
    )
    return { rows: shaped, rowCount }
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

// 되살리기: 지운 단위 (삭제 권한). 같은 코드가 다시 생겼으면 거부
export const restoreUnitsAction = createAction({
  permission: 'master.units.delete',
  input: z.object({ ids: idsSchema }),
  handler: ({ input }) => restoreUnits([...new Set(input.ids)]),
})
