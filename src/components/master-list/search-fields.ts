// 목록 검색 조건 정의 (화면은 이 배열만 만든다, docs/ui-guidelines.md "목록·검색 화면")
// 값은 모두 글자 — URL에 그대로 들어가고 서버는 src/lib/grid/list-filters.ts로 해석한다
//   여러 개: 'A,B' / 기간: '2026-11-01~2026-11-30' / 숫자 범위: '10~100' / 예·아니오: 'Y'|'N'

export type SearchFieldType =
  | 'keyword' // 통합 검색어 (화면에 하나, 서버의 searchFields로 여러 칸을 찾는다)
  | 'text' // 글자 한 칸
  | 'bizNo' // 사업자등록번호 (하이픈 넣어도 숫자로)
  | 'phone' // 전화번호 (하이픈 넣어도 숫자로)
  | 'select' // 하나 고르기 (options)
  | 'segment' // 짧은 선택지를 버튼 묶음으로 (예: 전체 / 사용 / 중지)
  | 'multi' // 여러 개 고르기 (options)
  | 'code' // 공통코드 하나 (codeGroup)
  | 'codeMulti' // 공통코드 여러 개 (codeGroup)
  | 'yn' // 전체 / 예 / 아니오
  | 'dateRange' // 기간
  | 'numberRange' // 숫자 범위
  | 'custom' // 화면 전용 입력 (render)

export type SearchOption = { value: string; label: string }

export type SearchFieldDef = {
  // URL·서버 조건 키 (영문, q·page·size·sort는 쓸 수 없음)
  key: string
  label: string
  type: SearchFieldType
  // 12칸 중 몇 칸 (기본 3, 검색어는 4)
  span?: 2 | 3 | 4 | 6
  // true면 [상세 조건]을 펼쳐야 보인다 (자주 쓰는 3~4개만 기본으로)
  detail?: boolean
  placeholder?: string
  // 선택지: 고정 목록, 또는 다른 조건 값에 따라 바뀌는 목록 (예: 고른 센터의 창고만)
  options?: readonly SearchOption[] | ((values: SearchValues) => readonly SearchOption[])
  // 이 조건들이 바뀌면 이 조건 값을 비운다 (예: 창고는 센터에, 구역은 창고에 딸림)
  dependsOn?: readonly string[]
  codeGroup?: string
  // 'segment'에서 값이 비었을 때(첫 버튼)의 이름 (기본 '전체'). 예: 보기 기준의 기본 보기 '위치별'
  allLabel?: string
  // 'yn'의 예/아니오 이름 (기본: 예 / 아니오)
  ynLabels?: [string, string]
  render?: (props: {
    id: string
    value: string
    onChange: (value: string) => void
    // 지금 입력 중인 모든 조건 값 (예: 창고 칸이 위에서 고른 센터를 본다)
    values: SearchValues
  }) => React.ReactNode
}

// 검색 조건 값 (키 → 글자, 빈 조건은 넣지 않는다)
export type SearchValues = Record<string, string>

// URL에서 목록 상태가 쓰는 예약 이름
export const RESERVED_PARAMS = ['q', 'page', 'size', 'sort'] as const

// 선택지 꺼내기 (함수면 지금 조건 값으로 계산)
export function optionsOf(field: SearchFieldDef, values: SearchValues): readonly SearchOption[] {
  return typeof field.options === 'function' ? field.options(values) : (field.options ?? [])
}

// 조건 하나를 바꾸면, 그 조건에 딸린 조건들(dependsOn)을 연달아 비운다
export function applySearchChange(
  fields: readonly SearchFieldDef[],
  values: SearchValues,
  key: string,
  value: string,
): SearchValues {
  const next: SearchValues = { ...values, [key]: value }
  const clear = (changed: string) => {
    for (const field of fields) {
      if (field.dependsOn?.includes(changed) && next[field.key]) {
        next[field.key] = ''
        clear(field.key)
      }
    }
  }
  clear(key)
  return next
}
