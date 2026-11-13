import type { ColumnDef, RowData } from '@tanstack/react-table'
import type { GridFeatures } from './features'
import type { DataGridColumn } from './types'

export const SELECT_COLUMN_ID = '__select'

// 우리 컬럼 정의 → TanStack 컬럼 정의
// 화면 그리기는 DataGrid가 직접 하므로, TanStack에는 "값 꺼내기·정렬·숨김 가능 여부"만 알려준다
export function toColumnDefs<TData extends RowData>(
  columns: DataGridColumn<TData>[],
  enableRowSelection: boolean,
): ColumnDef<GridFeatures, TData>[] {
  const defs: ColumnDef<GridFeatures, TData>[] = columns.map((column) => ({
    id: column.id,
    accessorFn: (row: TData) =>
      typeof column.accessor === 'function'
        ? column.accessor(row)
        : (row as Record<string, unknown>)[column.accessor],
    enableSorting: column.sortable ?? false,
    enableHiding: column.hideable ?? true,
    // 숫자 컬럼도 처음 누르면 오름차순 (TanStack 기본값은 숫자면 내림차순부터)
    sortDescFirst: false,
  }))

  if (enableRowSelection) {
    defs.unshift({ id: SELECT_COLUMN_ID, enableSorting: false, enableHiding: false })
  }
  return defs
}
