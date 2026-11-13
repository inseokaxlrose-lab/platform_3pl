import type { DataGridSort, DataGridState } from './types'

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 20

// 그리드 상태 기본값 (화면에서 초기 상태를 만들 때 사용)
export function createDataGridState(initial: Partial<DataGridState> = {}): DataGridState {
  return {
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    sorting: [],
    search: '',
    ...initial,
  }
}

// 전체 페이지 수: 데이터가 0건이어도 "1페이지"로 본다
export function getPageCount(rowCount: number, pageSize: number) {
  return Math.max(1, Math.ceil(rowCount / pageSize))
}

// 아래 변경 규칙의 공통 원칙:
// 보여줄 데이터 범위가 바뀌는 변경(검색어·정렬·건수)은 1페이지로 돌아간다
// (예: 50페이지를 보다가 검색했는데 결과가 3페이지뿐이면 빈 화면이 되는 것을 막는다)

export function changeSearch(state: DataGridState, search: string): DataGridState {
  if (state.search === search) return state
  return { ...state, search, pageIndex: 0 }
}

export function changeSorting(state: DataGridState, sorting: DataGridSort[]): DataGridState {
  return { ...state, sorting, pageIndex: 0 }
}

export function changePageSize(state: DataGridState, pageSize: number): DataGridState {
  if (state.pageSize === pageSize) return state
  return { ...state, pageSize, pageIndex: 0 }
}

// 페이지 이동: 0 ~ 마지막 페이지 범위를 벗어나지 않게 보정한다
export function changePageIndex(
  state: DataGridState,
  pageIndex: number,
  rowCount: number,
): DataGridState {
  const lastIndex = getPageCount(rowCount, state.pageSize) - 1
  const next = Math.min(Math.max(0, Math.trunc(pageIndex)), lastIndex)
  if (next === state.pageIndex) return state
  return { ...state, pageIndex: next }
}
