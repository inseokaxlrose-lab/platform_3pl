import { describe, expect, it } from 'vitest'
import {
  changePageIndex,
  changePageSize,
  changeSearch,
  changeSorting,
  createDataGridState,
  getPageCount,
} from './state'

const onPage5 = createDataGridState({ pageIndex: 4 })

describe('그리드 상태 변경 규칙', () => {
  it('기본값: 1페이지, 20건, 정렬·검색 없음', () => {
    expect(createDataGridState()).toEqual({ pageIndex: 0, pageSize: 20, sorting: [], search: '' })
  })

  it('검색어가 바뀌면 1페이지로 돌아간다', () => {
    expect(changeSearch(onPage5, 'ABC')).toMatchObject({ search: 'ABC', pageIndex: 0 })
  })

  it('검색어가 같으면 상태를 바꾸지 않는다 (불필요한 재조회 방지)', () => {
    expect(changeSearch(onPage5, '')).toBe(onPage5)
  })

  it('정렬이 바뀌면 1페이지로 돌아간다', () => {
    expect(changeSorting(onPage5, [{ id: 'qty', desc: true }])).toMatchObject({
      sorting: [{ id: 'qty', desc: true }],
      pageIndex: 0,
    })
  })

  it('한 페이지 건수가 바뀌면 1페이지로 돌아간다', () => {
    expect(changePageSize(onPage5, 50)).toMatchObject({ pageSize: 50, pageIndex: 0 })
  })

  it('페이지 이동은 0 ~ 마지막 페이지 범위로 보정한다', () => {
    const state = createDataGridState({ pageSize: 20 })
    expect(changePageIndex(state, 3, 100).pageIndex).toBe(3)
    expect(changePageIndex(state, 99, 100).pageIndex).toBe(4) // 100건 / 20 = 5페이지 → 마지막 index 4
    expect(changePageIndex(state, -1, 100).pageIndex).toBe(0)
  })

  it('전체 페이지 수는 최소 1', () => {
    expect(getPageCount(0, 20)).toBe(1)
    expect(getPageCount(21, 20)).toBe(2)
  })
})
