'use client'

import {
  useTable,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/common'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { DataGridCellValue, defaultAlign } from './data-grid-cell'
import { DataGridPagination } from './data-grid-pagination'
import { DataGridToolbar } from './data-grid-toolbar'
import { gridFeatures } from './features'
import { changePageIndex, changePageSize, changeSearch, changeSorting } from './state'
import { SELECT_COLUMN_ID, toColumnDefs } from './to-column-defs'
import type { DataGridColumn, DataGridDensity, DataGridState } from './types'

const SKELETON_ROW_COUNT = 8

export type DataGridProps<TData extends RowData> = {
  // 그리드 이름 (2차: 사용자별 컬럼 설정 저장 키)
  id: string
  columns: DataGridColumn<TData>[]
  // 현재 페이지의 행들 (서버가 정렬·검색·페이지를 적용해서 준 결과)
  data: TData[]
  // 서버 기준 전체 건수 (페이지 수 계산용)
  rowCount: number
  state: DataGridState
  onStateChange: (state: DataGridState) => void
  // 행을 구분하는 값 (선택 유지에 사용)
  getRowId: (row: TData) => string
  loading?: boolean
  enableRowSelection?: boolean
  // 선택한 행의 id 목록 (다른 페이지에서 선택한 행 포함)
  onSelectionChange?: (ids: string[]) => void
  // 검색칸 표시 (기본 표시)
  searchable?: boolean
  searchPlaceholder?: string
  // 툴바 오른쪽 화면별 버튼
  toolbarActions?: React.ReactNode
  // 데이터가 없을 때 안내 (검색 결과가 없을 때는 자동 문구)
  empty?: { title: string; description?: React.ReactNode; action?: React.ReactNode }
}

// 업데이트 값(값 또는 함수) 풀기: TanStack은 "새 값" 대신 "이전 값을 받아 새 값을 만드는 함수"를 줄 때가 있다
function resolve<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater
}

// 공통 목록 그리드: 모든 목록 화면은 이 컴포넌트를 쓴다 (docs/decisions/0002-ui-and-datagrid.md)
export function DataGrid<TData extends RowData>({
  columns,
  data,
  rowCount,
  state,
  onStateChange,
  getRowId,
  loading = false,
  enableRowSelection = false,
  onSelectionChange,
  searchable = true,
  searchPlaceholder,
  toolbarActions,
  empty,
}: DataGridProps<TData>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [density, setDensity] = useState<DataGridDensity>('compact')

  const columnDefs = useMemo(
    () => toColumnDefs(columns, enableRowSelection),
    [columns, enableRowSelection],
  )
  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])

  const sorting: SortingState = state.sorting
  const pagination: PaginationState = { pageIndex: state.pageIndex, pageSize: state.pageSize }

  function updateSelection(next: RowSelectionState) {
    setRowSelection(next)
    onSelectionChange?.(Object.keys(next).filter((id) => next[id]))
  }

  const table = useTable({
    features: gridFeatures,
    columns: columnDefs,
    data,
    getRowId: (row) => getRowId(row),
    // 정렬·페이지는 서버가 처리한다
    manualSorting: true,
    manualPagination: true,
    rowCount,
    enableRowSelection,
    state: { sorting, pagination, rowSelection, columnVisibility },
    onSortingChange: (updater) => onStateChange(changeSorting(state, resolve(updater, sorting))),
    onPaginationChange: (updater) => {
      const next = resolve(updater, pagination)
      onStateChange(
        next.pageSize !== state.pageSize
          ? changePageSize(state, next.pageSize)
          : changePageIndex(state, next.pageIndex, rowCount),
      )
    },
    onRowSelectionChange: (updater) => updateSelection(resolve(updater, rowSelection)),
    onColumnVisibilityChange: (updater) =>
      setColumnVisibility((previous) => resolve(updater, previous)),
  })

  const visibleColumns = table.getVisibleLeafColumns()
  const rows = table.getRowModel().rows
  const isFirstLoading = loading && data.length === 0
  const isEmpty = !loading && data.length === 0
  const cellPadding = density === 'compact' ? 'py-1.5' : 'py-3'

  const allPageSelected = table.getIsAllPageRowsSelected()
  const somePageSelected = table.getIsSomePageRowsSelected()

  return (
    <div className="space-y-3">
      <DataGridToolbar
        search={
          searchable
            ? {
                value: state.search,
                placeholder: searchPlaceholder,
                onChange: (value) => onStateChange(changeSearch(state, value)),
              }
            : undefined
        }
        selectedCount={Object.values(rowSelection).filter(Boolean).length}
        onClearSelection={() => updateSelection({})}
        density={density}
        onDensityChange={setDensity}
        columns={{
          items: table
            .getAllLeafColumns()
            .filter((column) => column.getCanHide())
            .map((column) => ({
              id: column.id,
              header: columnById.get(column.id)?.header ?? column.id,
              visible: column.getIsVisible(),
            })),
          onToggle: (id, visible) => table.getColumn(id)?.toggleVisibility(visible),
        }}
        actions={toolbarActions}
      />

      <div className="rounded-lg border bg-card" aria-busy={loading}>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {visibleColumns.map((column) => {
                if (column.id === SELECT_COLUMN_ID) {
                  return (
                    <TableHead key={column.id} className="w-10">
                      <Checkbox
                        aria-label="현재 페이지 전체 선택"
                        checked={
                          allPageSelected ? true : somePageSelected ? 'indeterminate' : false
                        }
                        onCheckedChange={(checked) =>
                          table.toggleAllPageRowsSelected(checked === true)
                        }
                        disabled={data.length === 0}
                      />
                    </TableHead>
                  )
                }
                const def = columnById.get(column.id)!
                const align = def.align ?? defaultAlign(def.format)
                const sorted = column.getIsSorted()
                return (
                  <TableHead
                    key={column.id}
                    style={def.width ? { width: def.width } : undefined}
                    className={cn(
                      align === 'right' && 'text-right',
                      align === 'center' && 'text-center',
                    )}
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                  >
                    {column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                          align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {def.header}
                        {sorted === 'asc' ? (
                          <ArrowUpIcon className="size-3.5" />
                        ) : sorted === 'desc' ? (
                          <ArrowDownIcon className="size-3.5" />
                        ) : (
                          <ArrowUpDownIcon className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      def.header
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>

          <TableBody
            className={cn('transition-opacity', loading && !isFirstLoading && 'opacity-50')}
          >
            {isFirstLoading &&
              Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id} className={cellPadding}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isEmpty && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length}>
                  {state.search ? (
                    <EmptyState
                      title="검색 결과가 없습니다"
                      description={`'${state.search}'와 일치하는 데이터가 없습니다.`}
                    />
                  ) : (
                    <EmptyState
                      title={empty?.title ?? '조회된 데이터가 없습니다'}
                      description={empty?.description}
                      action={empty?.action}
                    />
                  )}
                </TableCell>
              </TableRow>
            )}

            {!isFirstLoading &&
              rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => {
                    if (cell.column.id === SELECT_COLUMN_ID) {
                      return (
                        <TableCell key={cell.id} className={cellPadding}>
                          <Checkbox
                            aria-label="행 선택"
                            checked={row.getIsSelected()}
                            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
                          />
                        </TableCell>
                      )
                    }
                    const def = columnById.get(cell.column.id)!
                    const align = def.align ?? defaultAlign(def.format)
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cellPadding,
                          align === 'right' && 'text-right tabular-nums',
                          align === 'center' && 'text-center',
                        )}
                      >
                        {def.cell ? (
                          def.cell(row.original)
                        ) : (
                          <DataGridCellValue value={cell.getValue()} format={def.format} />
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <DataGridPagination
        rowCount={rowCount}
        pageIndex={state.pageIndex}
        pageSize={state.pageSize}
        onPageIndexChange={(index) => table.setPageIndex(index)}
        onPageSizeChange={(size) => table.setPageSize(size)}
      />
    </div>
  )
}
