import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseListUrl, toListQueryString } from './list-url'
import { SearchPanel } from './search-panel'
import type { SearchFieldDef } from './search-fields'
import { useListQuery, type ListRequest } from './use-list-query'

// 주소창 흉내: replace하면 URL 값이 바뀌고, 훅을 다시 그리면 그 값을 읽는다
let currentQuery = ''
const replace = vi.fn((url: string) => {
  currentQuery = url.split('?')[1] ?? ''
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/admin/list',
  useSearchParams: () => new URLSearchParams(currentQuery),
}))

const FIELDS: SearchFieldDef[] = [
  { key: 'keyword', label: '검색어', type: 'keyword' },
  {
    key: 'status',
    label: '상태',
    type: 'segment',
    options: [
      { value: 'ACTIVE', label: '사용' },
      { value: 'INACTIVE', label: '중지' },
    ],
  },
  { key: 'createdAt', label: '등록일', type: 'dateRange', detail: true },
]
const DEFAULTS = { pageSize: 20, sorting: [{ id: 'code', desc: false }] }

beforeEach(() => {
  currentQuery = ''
  replace.mockClear()
})

describe('목록 URL', () => {
  it('기본값은 URL에 넣지 않고, 페이지는 1부터, 조건·정렬·건수는 그대로 왕복한다', () => {
    const state = {
      grid: { pageIndex: 1, pageSize: 50, sorting: [{ id: 'name', desc: true }], search: '이천' },
      filters: { status: 'ACTIVE', createdAt: '2026-11-01~' },
    }
    const query = toListQueryString(state, DEFAULTS)
    expect(query).toBe(
      'q=%EC%9D%B4%EC%B2%9C&status=ACTIVE&createdAt=2026-11-01%7E&page=2&size=50&sort=name.desc',
    )
    expect(parseListUrl(new URLSearchParams(query), FIELDS, DEFAULTS)).toEqual(state)
    expect(
      toListQueryString(
        {
          grid: { pageIndex: 0, pageSize: 20, sorting: DEFAULTS.sorting, search: '' },
          filters: {},
        },
        DEFAULTS,
      ),
    ).toBe('')
  })

  it('잘못된 값은 기본값으로, 정의에 없는 조건은 무시, 정렬을 모두 풀면 none', () => {
    const parsed = parseListUrl(
      new URLSearchParams('page=-3&size=999&sort=bad&unknown=1'),
      FIELDS,
      DEFAULTS,
    )
    expect(parsed).toEqual({
      grid: { pageIndex: 0, pageSize: 20, sorting: DEFAULTS.sorting, search: '' },
      filters: {},
    })
    expect(parseListUrl(new URLSearchParams('sort=none'), FIELDS, DEFAULTS).grid.sorting).toEqual(
      [],
    )
  })
})

describe('SearchPanel', () => {
  it('[조회]·Enter를 눌러야 적용, 상세 조건은 펼쳐야 보이고, [초기화]', () => {
    const onSearch = vi.fn()
    const onReset = vi.fn()
    render(<SearchPanel fields={FIELDS} values={{}} onSearch={onSearch} onReset={onReset} />)

    fireEvent.change(screen.getByLabelText('검색어'), { target: { value: '이천' } })
    fireEvent.click(screen.getByRole('radio', { name: '사용' }))
    expect(onSearch).not.toHaveBeenCalled()
    fireEvent.submit(screen.getByRole('search'))
    expect(onSearch).toHaveBeenCalledWith({ keyword: '이천', status: 'ACTIVE' })

    expect(screen.queryByLabelText('시작일')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /상세 조건/ }))
    expect(screen.getByLabelText('시작일')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '초기화' }))
    expect(onReset).toHaveBeenCalled()
  })

  it('상세 조건이 적용돼 있으면 펼친 채로 시작하고 개수를 보여준다', () => {
    render(
      <SearchPanel
        fields={FIELDS}
        values={{ createdAt: '2026-11-01~' }}
        onSearch={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /상세 조건 \(1\)/ })).toBeTruthy()
    expect((screen.getByLabelText('시작일') as HTMLInputElement).value).toBe('2026-11-01')
  })
})

describe('useListQuery', () => {
  type Row = { id: string }
  const ok = (rows: Row[]) => ({ ok: true as const, data: { rows, rowCount: rows.length } })

  it('URL의 조건으로 조회하고, 조회하면 1페이지로 URL을 바꾼다', async () => {
    currentQuery = 'q=old&page=3'
    const fetch = vi.fn(async (_: ListRequest) => ok([{ id: 'a' }]))
    const { result } = renderHook(() =>
      useListQuery<Row>({ gridId: 't', fields: FIELDS, fetch, defaultSort: DEFAULTS.sorting }),
    )
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'a' }]))
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'old', pageIndex: 2, filters: {} }),
    )
    expect(result.current.values).toEqual({ keyword: 'old' })

    act(() => result.current.search({ keyword: '새', status: 'ACTIVE' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/list?q=%EC%83%88&status=ACTIVE', {
      scroll: false,
    })
  })

  it('늦게 온 이전 응답은 버리고 마지막 요청의 결과만 쓴다', async () => {
    const resolvers: ((rows: Row[]) => void)[] = []
    const fetch = vi.fn(
      () =>
        new Promise<ReturnType<typeof ok>>((resolve) =>
          resolvers.push((rows) => resolve(ok(rows))),
        ),
    )
    const { result, rerender } = renderHook(() =>
      useListQuery<Row>({ gridId: 't', fields: FIELDS, fetch }),
    )
    act(() => result.current.search({ keyword: '두번째' }))
    rerender()
    expect(fetch).toHaveBeenCalledTimes(2)

    await act(async () => resolvers[1]([{ id: 'new' }]))
    await act(async () => resolvers[0]([{ id: 'old' }]))
    expect(result.current.rows).toEqual([{ id: 'new' }])
  })

  it('서버 액션이 실패해도 로딩을 끝내고 오류 문구를 보여준다', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('boom')))
    const { result } = renderHook(() => useListQuery<Row>({ gridId: 't', fields: FIELDS, fetch }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('서버와 통신하지 못했습니다')
  })

  it('autoSearch=false면 [조회] 전에는 읽지 않는다', () => {
    const fetch = vi.fn(async () => ok([]))
    const { result } = renderHook(() =>
      useListQuery<Row>({ gridId: 't', fields: FIELDS, fetch, autoSearch: false }),
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.searched).toBe(false)
  })

  it('엑셀용 전체 읽기는 같은 조건에 exportAll을 붙인다', async () => {
    currentQuery = 'status=ACTIVE'
    const fetch = vi.fn(async () => ok([{ id: 'x' }]))
    const { result } = renderHook(() => useListQuery<Row>({ gridId: 't', fields: FIELDS, fetch }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(await result.current.fetchAll()).toEqual([{ id: 'x' }])
    expect(fetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: { status: 'ACTIVE' }, exportAll: true }),
    )
  })
})
