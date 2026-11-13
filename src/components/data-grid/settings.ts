import { z } from 'zod'
import { PAGE_SIZE_OPTIONS } from './state'
import type { DataGridSort } from './types'

// 사용자별 그리드 설정 (docs/decisions/0021): 숨긴 컬럼·순서·너비, 행 높이, 한 페이지 건수, 정렬
// DB에는 JSON으로 저장한다. 읽을 때 모양을 검사하고, 화면의 현재 컬럼과 맞춰 정리한다
// (화면에서 컬럼이 없어지거나 새로 생겨도 깨지지 않게)

export const MIN_COLUMN_WIDTH = 60
export const MAX_COLUMN_WIDTH = 800

const columnId = z.string().min(1).max(100)

export const gridSettingsSchema = z.object({
  // 컬럼 순서 (선택 칸 제외)
  columnOrder: z.array(columnId).max(100).optional(),
  // 숨긴 컬럼
  hidden: z.array(columnId).max(100).optional(),
  // 컬럼 너비(px)
  widths: z.record(columnId, z.number().int().positive()).optional(),
  density: z.enum(['compact', 'comfortable']).optional(),
  pageSize: z
    .number()
    .int()
    .refine((size) => (PAGE_SIZE_OPTIONS as readonly number[]).includes(size))
    .optional(),
  sorting: z
    .array(z.object({ id: columnId, desc: z.boolean() }))
    .max(5)
    .optional(),
})

export type GridSettings = z.infer<typeof gridSettingsSchema>

// DB 값 읽기: 모양이 깨졌으면 설정 없음으로 본다 (기본 모습으로 보여주는 편이 오류보다 낫다)
export function parseGridSettings(raw: unknown): GridSettings {
  const parsed = gridSettingsSchema.safeParse(raw)
  return parsed.success ? parsed.data : {}
}

// 정리에 필요한 컬럼 정보 (DataGridColumn의 일부)
type ColumnInfo = { id: string; hideable?: boolean; sortable?: boolean }

// 컬럼 순서: 저장된 순서를 따르되
// - 지금 없는 컬럼은 버린다
// - 새로 생긴 컬럼은 기본 순서에서 바로 앞 컬럼의 뒤에 넣는다 (맨 앞이면 맨 앞)
export function resolveColumnOrder(defaultIds: readonly string[], saved?: readonly string[]) {
  if (!saved) return [...defaultIds]
  const exists = new Set(defaultIds)
  const order = [...new Set(saved)].filter((id) => exists.has(id))
  defaultIds.forEach((id, index) => {
    if (order.includes(id)) return
    const previous = defaultIds[index - 1]
    const at = previous === undefined ? 0 : order.indexOf(previous) + 1
    order.splice(at, 0, id)
  })
  return order
}

// 숨긴 컬럼: 지금 있고 숨길 수 있는 컬럼만
export function resolveHidden(columns: readonly ColumnInfo[], hidden?: readonly string[]) {
  const allowed = new Set(columns.filter((c) => c.hideable !== false).map((c) => c.id))
  return (hidden ?? []).filter((id) => allowed.has(id))
}

export function clampWidth(width: number) {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)))
}

// 너비: 지금 있는 컬럼만, 최소·최대 범위로
export function resolveWidths(columns: readonly ColumnInfo[], widths?: Record<string, number>) {
  const exists = new Set(columns.map((c) => c.id))
  return Object.fromEntries(
    Object.entries(widths ?? {})
      .filter(([id]) => exists.has(id))
      .map(([id, width]) => [id, clampWidth(width)]),
  )
}

// 정렬: 지금 있고 정렬할 수 있는 컬럼만
export function resolveSorting(
  columns: readonly ColumnInfo[],
  sorting?: readonly DataGridSort[],
): DataGridSort[] {
  const sortable = new Set(columns.filter((c) => c.sortable).map((c) => c.id))
  return (sorting ?? []).filter((sort) => sortable.has(sort.id))
}
