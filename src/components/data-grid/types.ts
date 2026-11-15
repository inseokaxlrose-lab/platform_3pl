import type { StatusTone } from '@/components/common'

// 정렬 하나: 어떤 컬럼을 오름/내림차순으로
export type DataGridSort = { id: string; desc: boolean }

// 그리드 상태: 서버에 "어떤 데이터를 달라"고 요청할 때 쓰는 값 (2차에서 URL과 동기화)
export type DataGridState = {
  pageIndex: number // 0부터 시작
  pageSize: number
  sorting: DataGridSort[]
  search: string
}

// 상태 배지 서식: 값 → 라벨·톤 연결표 (예: { PLANNED: { label: '예정', tone: 'info' } })
export type StatusFormat = Record<string, { label: string; tone: StatusTone }>

// 셀 서식 (cellType) — 정렬 기본값은 숫자 오른쪽, 코드·날짜·상태·번호·Y/N 가운데, 글자 왼쪽
// - text: 그대로 (길면 말줄임 + 마우스를 올리면 전체 글자)
// - number: 천 단위 쉼표 / { number: { decimals, unit } }: 소수 자리·단위 (금액·무게 등)
// - date: 2026-11-13 / datetime: 2026-11-13 14:05
// - bizNo: 123-45-67891 / phone: 02-123-4567 (DB의 숫자만 값을 하이픈으로, 0029)
// - yn: true/false → 예/아니오 배지
// - { status }: 상태 배지 / { code: 그룹 }: 공통코드 값 → 이름 (0030)
export type CellFormat =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'bizNo'
  | 'phone'
  | 'yn'
  | { number: { decimals?: number; unit?: string } }
  | { status: StatusFormat }
  | { code: string }

// 화면에서 쓰는 컬럼 정의 (TanStack 형식을 몰라도 되도록 단순화)
export type DataGridColumn<TData> = {
  id: string
  header: string
  // 값 꺼내는 방법: 속성 이름 또는 함수
  accessor: (keyof TData & string) | ((row: TData) => unknown)
  format?: CellFormat
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  // false면 컬럼 메뉴에서 숨길 수 없다 (기본 true)
  hideable?: boolean
  // true면 처음(설정 저장 전·기본값 되돌리기 후)에는 숨겨 둔다
  defaultHidden?: boolean
  // 컬럼 너비(px). 없으면 내용에 맞춤
  width?: number
  // 왼쪽 고정: 가로로 스크롤해도 보인다 (코드·명칭). 고정 컬럼은 항상 맨 앞에 그린다
  pinned?: boolean
  // 주면 값을 링크로 그린다 (예: 코드 → 상세 화면)
  href?: (row: TData) => string
  // 특별한 모양이 필요할 때 직접 그리기 (서식보다 우선)
  cell?: (row: TData) => React.ReactNode
}

export type DataGridDensity = 'compact' | 'comfortable'
