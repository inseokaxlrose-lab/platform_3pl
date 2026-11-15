'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DataGridSort, DataGridState } from '@/components/data-grid'
import { DEFAULT_PAGE_SIZE } from '@/components/data-grid'
import { useGridSettingsStore } from '@/components/data-grid/grid-settings-context'
import type { ActionResult } from '@/lib/actions'
import { parseListUrl, toListQueryString, type ListDefaults } from './list-url'
import type { SearchFieldDef, SearchValues } from './search-fields'

// 서버에 보내는 목록 요청 (서버는 listQuerySchema로 검사, src/lib/grid/grid-query.ts)
export type ListRequest = DataGridState & { filters: SearchValues; exportAll?: boolean }
export type ListResponse<TRow> = { rows: TRow[]; rowCount: number }
export type ListFetcher<TRow> = (request: ListRequest) => Promise<ActionResult<ListResponse<TRow>>>

type UseListQueryOptions<TRow> = {
  // DataGrid id와 같게 (사용자별 설정의 건수·정렬을 기본값으로 쓴다)
  gridId: string
  fields: readonly SearchFieldDef[]
  fetch: ListFetcher<TRow>
  // 처음 들어왔을 때 바로 조회할지 (기본 true). false면 [조회]를 눌러야 조회한다
  autoSearch?: boolean
  // 사용자가 정렬을 고르지 않았을 때 (서버의 기본 정렬과 같게)
  defaultSort?: DataGridSort[]
}

// 목록으로 돌아갈 주소 저장 키 (상세 화면의 [목록] 버튼이 읽는다)
export const listReturnKey = (pathname: string) => `list-return:${pathname}`
const scrollKey = (url: string) => `list-scroll:${url}`

const storage = {
  get(key: string) {
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value)
    } catch {
      // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 기억하지 않는다
    }
  },
}

// 목록 화면의 동작 (docs/ui-guidelines.md "목록·검색 화면")
// - 검색 조건·페이지·건수·정렬을 URL과 맞춘다 → 상세 화면에 갔다가 뒤로 와도, URL을 공유해도 같은 결과
// - 조건을 바꾸면 1페이지로, 마지막 요청의 응답만 쓴다(빠르게 여러 번 눌러도), 같은 요청이 진행 중이면 다시 보내지 않는다
// - 스크롤 위치를 기억했다가 돌아오면 데이터를 그린 뒤 되돌린다
export function useListQuery<TRow>({
  gridId,
  fields,
  fetch,
  autoSearch = true,
  defaultSort = [],
}: UseListQueryOptions<TRow>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const saved = useGridSettingsStore().get(gridId)
  const defaults: ListDefaults = useMemo(
    () => ({
      pageSize: saved?.pageSize ?? DEFAULT_PAGE_SIZE,
      sorting: saved?.sorting ?? defaultSort,
    }),
    // 저장값은 화면에 들어올 때 한 번만 기준으로 삼는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const queryString = searchParams.toString()
  // 조건 정의 배열은 화면이 그릴 때마다 새로 만들 수 있으므로 키·종류 글자로 비교한다
  // (배열 자체로 비교하면 매번 새 상태 → 조회가 끝없이 반복된다)
  const fieldsKey = fields.map((f) => `${f.key}:${f.type}`).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFields = useMemo(() => fields, [fieldsKey])
  const { grid, filters } = useMemo(
    () => parseListUrl(new URLSearchParams(queryString), stableFields, defaults),
    [queryString, stableFields, defaults],
  )
  // [조회]를 누르기 전 (autoSearch=false이고 URL에 조건이 하나도 없을 때)
  const [searchedManually, setSearchedManually] = useState(false)
  const searched = autoSearch || queryString !== '' || searchedManually

  const [result, setResult] = useState<ListResponse<TRow>>({ rows: [], rowCount: 0 })
  const [loading, setLoading] = useState(searched)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  function navigate(nextGrid: DataGridState, nextFilters: SearchValues) {
    const next = toListQueryString({ grid: nextGrid, filters: nextFilters }, defaults)
    if (next === queryString) {
      // 같은 조건으로 다시 [조회] → 새로 읽기 (진행 중이면 무시)
      setVersion((v) => v + 1)
      return
    }
    setLoading(true)
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  // ── 조회: 마지막 요청만 반영, 같은 요청이 진행 중이면 다시 보내지 않는다
  const latest = useRef(0)
  const inFlight = useRef<string | null>(null)
  const fetchRef = useRef(fetch)
  useEffect(() => {
    fetchRef.current = fetch
  })
  const requestKey = `${queryString}#${version}`
  useEffect(() => {
    if (!searched || inFlight.current === requestKey) return
    const id = ++latest.current
    inFlight.current = requestKey
    fetchRef
      .current({ ...grid, filters })
      // 서버 액션 자체가 실패(네트워크·서버 오류)해도 "불러오지 못함"으로 끝낸다 (로딩이 멈추지 않게)
      .catch(() => ({
        ok: false as const,
        error: { message: '서버와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      }))
      .then((response) => {
        if (id !== latest.current) return // 늦게 온 이전 응답은 버린다
        inFlight.current = null
        if (response.ok) {
          setResult(response.data)
          setError(null)
        } else {
          setError(response.error.message)
        }
        setLoading(false)
      })
    // grid·filters는 requestKey(URL)에서 나온 값이라 requestKey로만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, searched])

  // ── 목록 주소 기억 + 스크롤 위치 기억·복원
  const fullUrl = queryString ? `${pathname}?${queryString}` : pathname
  useEffect(() => {
    storage.set(listReturnKey(pathname), fullUrl)
    const onScroll = () => storage.set(scrollKey(fullUrl), String(Math.round(window.scrollY)))
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname, fullUrl])
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || loading) return
    restored.current = true
    const y = Number(storage.get(scrollKey(fullUrl)))
    if (y > 0) window.scrollTo(0, y)
  }, [loading, fullUrl])

  return {
    // DataGrid에 넘길 상태 (정렬·페이지·건수를 바꾸면 URL이 바뀐다)
    grid,
    setGrid(next: DataGridState) {
      // 건수·정렬이 바뀌면 1페이지로 (DataGrid가 이미 맞춰서 준다)
      navigate(next, filters)
    },
    // 지금 적용된 검색 조건 (검색어는 keyword 칸 키로 함께)
    values: useMemo(() => {
      const keyword = stableFields.find((f) => f.type === 'keyword')
      return keyword && grid.search ? { ...filters, [keyword.key]: grid.search } : filters
    }, [stableFields, filters, grid.search]),
    // [조회]: 조건을 적용하고 1페이지로
    search(values: SearchValues) {
      const keyword = fields.find((f) => f.type === 'keyword')
      const nextFilters = Object.fromEntries(
        Object.entries(values).filter(([key, value]) => value && key !== keyword?.key),
      )
      setSearchedManually(true)
      navigate(
        { ...grid, pageIndex: 0, search: keyword ? (values[keyword.key] ?? '') : '' },
        nextFilters,
      )
    },
    // [초기화]: 조건·페이지를 비운다 (건수·정렬은 유지)
    reset() {
      navigate({ ...grid, pageIndex: 0, search: '' }, {})
    },
    // 일괄 처리 뒤 등: 같은 조건으로 다시 읽기
    refresh() {
      setLoading(true)
      setVersion((v) => v + 1)
    },
    searched,
    hasConditions: grid.search !== '' || Object.keys(filters).length > 0,
    rows: result.rows,
    rowCount: result.rowCount,
    loading,
    error,
    // 엑셀: 현재 조건의 전체 결과 (페이지와 상관없이, 서버 최대 건수까지)
    async fetchAll(): Promise<TRow[]> {
      const response = await fetchRef.current({ ...grid, filters, exportAll: true })
      if (!response.ok) throw new Error(response.error.message)
      return response.data.rows
    },
  }
}

export type ListQuery<TRow> = ReturnType<typeof useListQuery<TRow>>
