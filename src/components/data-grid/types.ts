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

// 셀 서식
// - text: 그대로 / number: 천 단위 쉼표, 오른쪽 정렬 / date: 2026-11-13 / datetime: 2026-11-13 14:05
export type CellFormat = 'text' | 'number' | 'date' | 'datetime' | { status: StatusFormat }

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
  // 컬럼 너비(px). 없으면 내용에 맞춤
  width?: number
  // 특별한 모양이 필요할 때 직접 그리기 (서식보다 우선)
  cell?: (row: TData) => React.ReactNode
}

export type DataGridDensity = 'compact' | 'comfortable'
