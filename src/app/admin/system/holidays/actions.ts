'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { codesFilter, idFilter } from '@/lib/grid/list-filters'
import { weekdayIndex } from '@/lib/holidays/business-calendar'
import { HOLIDAY_DAY_TYPE } from '@/lib/holidays/holiday-codes'
import { operatorHolidaySchema } from '@/lib/holidays/holiday-schema'
import { syncNationalHolidays } from '@/lib/holidays/holiday-sync'
import {
  assertHolidaysWritable,
  assertHolidayWritable,
  createOperatorHoliday,
  deleteOperatorHolidays,
  restoreOperatorHolidays,
  updateOperatorHoliday,
} from '@/lib/holidays/operator-holidays'
import { kstToday } from '@/lib/stock/expiry'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { operatorFilter, type DataScope } from '@/lib/scope/data-scope'
import { DELETED_ONLY } from '@/lib/status'

// 휴무관리 서버 액션 (docs/decisions/0096) — 권한 system.holidays.*
// 국가 공휴일(운영사 공통)과 운영사 개별 휴일을 한 목록으로 보여 준다

const idsSchema = z.array(idSchema).min(1).max(200)
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

// 목록 구분: 국가 공휴일 / 휴무 / 특근
const KIND_VALUES = ['NATIONAL', ...HOLIDAY_DAY_TYPE.values] as const

export type HolidayRow = {
  id: string // 국가 공휴일은 'N' + 키 (고치지 못함), 개별 휴일은 키
  source: 'NATIONAL' | 'OPERATOR'
  holidayOn: string
  weekday: string
  name: string
  kind: (typeof KIND_VALUES)[number]
  centerId: string | null
  centerName: string | null
  remark: string | null
  rowVersion: number | null
  updatedAt: Date | null
  updatedBy: string | null
  editable: boolean
}

const textOf = (date: Date) => date.toISOString().slice(0, 10)
const dateOf = (text: string) => new Date(`${text}T00:00:00.000Z`)

// 센터 직원은 운영사 전체 휴일 + 소속 센터 휴일만 본다
function centerWhere(scope: DataScope, centerId: bigint | undefined) {
  if (scope.kind === 'CENTERS') {
    const allowed =
      centerId === undefined ? scope.centerIds : scope.centerIds.filter((id) => id === centerId)
    return { OR: [{ centerId: null }, { centerId: { in: allowed } }] }
  }
  // 센터를 고르면 그 센터에 적용되는 휴일 (운영사 전체 + 그 센터)
  return centerId === undefined ? {} : { OR: [{ centerId: null }, { centerId }] }
}

// 목록 (검색 조건: year·kind·center·status=DELETED) — 연도별 수십 건이라 합쳐서 메모리에서 정렬·페이지
export const listHolidaysAction = createAction({
  permission: 'system.holidays.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) => {
    if (input.exportAll) throw new ActionError('FORBIDDEN', '엑셀 내려받기를 지원하지 않습니다.')
    const { filters } = input
    const year = /^\d{4}$/.test(filters.year ?? '') ? Number(filters.year) : undefined
    const range = year ? { gte: dateOf(`${year}-01-01`), lte: dateOf(`${year}-12-31`) } : undefined
    const kinds = (codesFilter(filters, 'kind')?.in ?? []).filter((k) =>
      (KIND_VALUES as readonly string[]).includes(k),
    )
    const wants = (kind: string) => kinds.length === 0 || kinds.includes(kind)
    const centerId = idFilter(filters, 'center')
    const deleted = filters.status === 'DELETED'
    const keyword = input.search.trim()
    const nameWhere = keyword ? { name: { contains: keyword, mode: 'insensitive' as const } } : {}
    const ownKinds = HOLIDAY_DAY_TYPE.values.filter(wants)

    const [national, own] = await Promise.all([
      deleted || !wants('NATIONAL')
        ? []
        : prisma.holiday.findMany({
            where: { ...(range && { holidayOn: range }), ...nameWhere },
            select: { id: true, holidayOn: true, name: true },
          }),
      ownKinds.length === 0
        ? []
        : prisma.operatorHoliday.findMany({
            where: {
              AND: [
                operatorFilter(scope),
                centerWhere(scope, centerId),
                range ? { holidayOn: range } : {},
                nameWhere,
                { dayType: { in: ownKinds } },
                deleted ? DELETED_ONLY : {},
              ],
            },
            select: {
              id: true,
              operatorId: true,
              centerId: true,
              center: { select: { name: true } },
              holidayOn: true,
              name: true,
              dayType: true,
              remark: true,
              rowVersion: true,
              updatedAt: true,
              updatedBy: true,
            },
          }),
    ])

    const rows: HolidayRow[] = [
      ...national.map((h) => ({
        id: `N${h.id}`,
        source: 'NATIONAL' as const,
        holidayOn: textOf(h.holidayOn),
        weekday: WEEKDAYS[weekdayIndex(textOf(h.holidayOn))],
        name: h.name,
        kind: 'NATIONAL' as const,
        centerId: null,
        centerName: null,
        remark: null,
        rowVersion: null,
        updatedAt: null,
        updatedBy: null,
        editable: false,
      })),
      ...own.map((h) => {
        let editable = true
        try {
          assertHolidayWritable(scope, h)
        } catch {
          editable = false
        }
        return {
          id: String(h.id),
          source: 'OPERATOR' as const,
          holidayOn: textOf(h.holidayOn),
          weekday: WEEKDAYS[weekdayIndex(textOf(h.holidayOn))],
          name: h.name,
          kind: h.dayType as HolidayRow['kind'],
          centerId: h.centerId === null ? null : String(h.centerId),
          centerName: h.center?.name ?? null,
          remark: h.remark,
          rowVersion: h.rowVersion,
          updatedAt: h.updatedAt,
          updatedBy: h.updatedBy,
          editable,
        }
      }),
    ]

    // 정렬: 날짜(기본)·이름·구분·적용 범위. 같은 날은 국가 공휴일 → 운영사 전체 → 센터 순
    const rank = (row: HolidayRow) =>
      row.source === 'NATIONAL' ? 0 : row.centerId === null ? 1 : 2
    const keyOf: Record<string, (row: HolidayRow) => string> = {
      holidayOn: (row) => row.holidayOn,
      name: (row) => row.name,
      kind: (row) => row.kind,
      scope: (row) => `${rank(row)}${row.centerName ?? ''}`,
    }
    const sort = input.sorting.find((s) => keyOf[s.id]) ?? { id: 'holidayOn', desc: false }
    rows.sort((a, b) => {
      const order = keyOf[sort.id](a).localeCompare(keyOf[sort.id](b), 'ko')
      if (order !== 0) return sort.desc ? -order : order
      return a.holidayOn.localeCompare(b.holidayOn) || rank(a) - rank(b)
    })
    const start = input.pageIndex * input.pageSize
    return { rows: rows.slice(start, start + input.pageSize), rowCount: rows.length }
  },
})

export const createHolidayAction = createAction({
  permission: 'system.holidays.create',
  input: operatorHolidaySchema,
  handler: ({ input, scope }) => createOperatorHoliday(input, scope),
})

export const updateHolidayAction = createAction({
  permission: 'system.holidays.update',
  input: operatorHolidaySchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: ({ input: { id, rowVersion, ...data }, scope }) =>
    updateOperatorHoliday(id, rowVersion, data, scope),
})

export const deleteHolidaysAction = createAction({
  permission: 'system.holidays.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    const ids = [...new Set(input.ids)]
    await assertHolidaysWritable(ids, scope)
    return deleteOperatorHolidays(ids)
  },
})

export const restoreHolidaysAction = createAction({
  permission: 'system.holidays.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    const ids = [...new Set(input.ids)]
    await assertHolidaysWritable(ids, scope, true)
    return restoreOperatorHolidays(ids)
  },
})

// 국가 공휴일 다시 가져오기 (운영사 공통 자료라 누가 가져와도 같은 결과). 작년 ~ 내후년
export const syncHolidaysAction = createAction({
  permission: 'system.holidays.update',
  input: z.object({ year: z.number().int() }),
  handler: async ({ input }) => {
    const thisYear = Number(kstToday().slice(0, 4))
    if (input.year < thisYear - 1 || input.year > thisYear + 2) {
      throw new ActionError('VALIDATION', `${thisYear - 1}~${thisYear + 2}년만 가져올 수 있습니다.`)
    }
    return syncNationalHolidays(input.year)
  },
})
