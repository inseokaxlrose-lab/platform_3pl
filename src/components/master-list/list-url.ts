import type { DataGridSort, DataGridState } from '@/components/data-grid'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/components/data-grid'
import { RESERVED_PARAMS, type SearchFieldDef, type SearchValues } from './search-fields'

// 목록 상태 ↔ URL 쿼리 (순수 함수)
// ?q=검색어&page=2&size=50&sort=createdAt.desc,code.asc&status=ACTIVE&createdAt=2026-11-01~
// - 페이지는 사람이 읽기 쉽게 1부터, 기본값(1페이지·기본 건수·기본 정렬)은 URL에 넣지 않는다

export type ListUrlState = { grid: DataGridState; filters: SearchValues }

export type ListDefaults = { pageSize: number; sorting: DataGridSort[] }

const sortToText = (sorting: DataGridSort[]) =>
  sorting.map((s) => `${s.id}.${s.desc ? 'desc' : 'asc'}`).join(',')

function parseSort(text: string | null): DataGridSort[] | null {
  if (!text) return null
  const sorting = text
    .split(',')
    .map((part) => /^([\w-]+)\.(asc|desc)$/.exec(part))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ id: m[1], desc: m[2] === 'desc' }))
  return sorting.length > 0 ? sorting.slice(0, 5) : null
}

export function parseListUrl(
  params: URLSearchParams,
  fields: readonly SearchFieldDef[],
  defaults: ListDefaults,
): ListUrlState {
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  const filters: SearchValues = {}
  for (const field of fields) {
    if (field.type === 'keyword') continue
    const value = params.get(field.key)
    if (value) filters[field.key] = value
  }
  return {
    grid: {
      pageIndex: Number.isInteger(page) && page > 1 ? page - 1 : 0,
      pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(size) ? size : defaults.pageSize,
      // 'none' = 사용자가 정렬을 모두 푼 상태 (기본 정렬로 돌아가지 않게)
      sorting:
        params.get('sort') === 'none' ? [] : (parseSort(params.get('sort')) ?? defaults.sorting),
      search: params.get('q') ?? '',
    },
    filters,
  }
}

export function toListQueryString(state: ListUrlState, defaults: ListDefaults) {
  const params = new URLSearchParams()
  if (state.grid.search.trim()) params.set('q', state.grid.search.trim())
  for (const [key, value] of Object.entries(state.filters)) {
    if (value && !(RESERVED_PARAMS as readonly string[]).includes(key)) params.set(key, value)
  }
  if (state.grid.pageIndex > 0) params.set('page', String(state.grid.pageIndex + 1))
  if (state.grid.pageSize !== defaults.pageSize) params.set('size', String(state.grid.pageSize))
  if (sortToText(state.grid.sorting) !== sortToText(defaults.sorting)) {
    // 정렬을 모두 푼 상태도 기본 정렬과 다르면 남긴다 ('none')
    params.set('sort', state.grid.sorting.length > 0 ? sortToText(state.grid.sorting) : 'none')
  }
  return params.toString()
}

export const LIST_DEFAULTS: ListDefaults = { pageSize: DEFAULT_PAGE_SIZE, sorting: [] }
