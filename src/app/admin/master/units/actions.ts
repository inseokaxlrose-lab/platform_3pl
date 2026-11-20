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
import {
  isUnitActive,
  resolveUnitDecimals,
  unitStatusFilter,
  unitStatusSelect,
} from '@/lib/units/unit-status'
import { unitCreateSchema, unitUpdateSchema } from '@/lib/units/unit-schema'
import {
  createUnit,
  deleteUnits,
  restoreUnits,
  setOperatorUnitDecimals,
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
    // 정렬을 고르지 않으면 단위 유형(UNIT_TYPES 순서: 수량 → 포장 → 중량 …) → 정렬 순서 → 코드
    // 유형은 글자 칸이라 DB 정렬은 알파벳 순 → 이때만 전부 읽어 프로그램에서 정렬하고 쪽을 자른다 (단위는 운영사당 수십 개)
    const typeOrder = input.sorting.length === 0
    const [found, rowCount] = await prisma.$transaction([
      prisma.unit.findMany({
        ...query,
        ...(typeOrder && { skip: undefined, take: undefined }),
        orderBy: typeOrder ? [{ sortOrder: 'asc' }, { code: 'asc' }] : query.orderBy,
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
    const rank = (type: string) => (UNIT_TYPES as readonly string[]).indexOf(type)
    const rows = typeOrder
      ? [...found]
          .sort((a, b) => rank(a.type) - rank(b.type))
          .slice(query.skip, query.skip + query.take)
      : found
    // 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
    resolveUnitDecimals(rows)
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

// 시스템 기본 단위의 소수 자리수: 이 운영사에서만 (0079)
export const setUnitDecimalsAction = createAction({
  permission: 'master.units.update',
  input: z.object({ id: idSchema, decimals: z.number().int().min(0).max(6) }),
  handler: ({ input }) => setOperatorUnitDecimals(input.id, input.decimals),
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
