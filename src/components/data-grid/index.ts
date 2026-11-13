// 공통 DataGrid: 바깥(화면)에서는 이 파일로 공개된 것만 사용한다
// 화면에서 <table>이나 TanStack Table을 직접 쓰지 않는다 (CLAUDE.md UI 규칙)
export { DataGrid, type DataGridProps } from './data-grid'
export { formatDate, formatNumber } from './format'
// 그리드 설정 보관함(GridSettingsProvider)은 서버 액션을 불러오므로 여기서 내보내지 않는다
// (화면 부품·테스트가 DB 연결까지 끌어오지 않게) → AppShell에서 './grid-settings-provider'로 직접
export { createDataGridState, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './state'
export type { CellFormat, DataGridColumn, DataGridSort, DataGridState, StatusFormat } from './types'
export { useDataGridState } from './use-data-grid-state'
