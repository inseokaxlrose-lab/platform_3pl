'use client'

import {
  useTable,
  type ColumnOrderState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
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
import { csvFileName, toCsv } from './csv'
import { DataGridToolbar, type ExportMode } from './data-grid-toolbar'
import { downloadTextFile } from './download'
import { gridFeatures } from './features'
import { useGridSettingsStore } from './grid-settings-context'
import { resolveColumnOrder, resolveHidden, resolveWidths, type GridSettings } from './settings'
import {
  changePageIndex,
  changePageSize,
  changeSearch,
  changeSorting,
  DEFAULT_PAGE_SIZE,
  getPageCount,
} from './state'
import { SELECT_COLUMN_ID, toColumnDefs } from './to-column-defs'
import type { DataGridColumn, DataGridDensity, DataGridState } from './types'

const SKELETON_ROW_COUNT = 8

export type DataGridProps<TData extends RowData> = {
  // 그리드 이름: 사용자별 설정 저장 키 (영문 소문자·숫자·하이픈, 예: system-users)
  // 정렬·건수 저장값으로 시작하려면 화면에서 useDataGridState(같은 id)를 쓴다
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
  // CSV 내보내기: 주면 툴바에 [내보내기] 버튼이 생긴다
  // fetchRows는 "현재 검색·정렬 조건에 맞는 전체 행"을 돌려줘야 한다 (현재 페이지만이 아님)
  exportCsv?: { fileName: string; fetchRows: () => Promise<TData[]> }
}

// 업데이트 값(값 또는 함수) 풀기: TanStack은 "새 값" 대신 "이전 값을 받아 새 값을 만드는 함수"를 줄 때가 있다
function resolve<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater
}

// 공통 목록 그리드: 모든 목록 화면은 이 컴포넌트를 쓴다 (docs/decisions/0002-ui-and-datagrid.md)
export function DataGrid<TData extends RowData>({
  id,
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
  exportCsv,
}: DataGridProps<TData>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // ── 사용자별 설정 (0021): 저장된 값으로 시작하고, 바뀌면 자동 저장
  const settingsStore = useGridSettingsStore()
  const [saved] = useState<GridSettings>(() => settingsStore.get(id) ?? {})
  const defaultOrder = useMemo(() => columns.map((c) => c.id), [columns])
  const [columnOrderSetting, setColumnOrder] = useState<string[]>(() =>
    resolveColumnOrder(defaultOrder, saved.columnOrder),
  )
  const [hiddenSetting, setHidden] = useState<string[]>(() => resolveHidden(columns, saved.hidden))
  const [widthSetting, setWidths] = useState<Record<string, number>>(() =>
    resolveWidths(columns, saved.widths),
  )
  const [density, setDensity] = useState<DataGridDensity>(saved.density ?? 'compact')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const columnDefs = useMemo(
    () => toColumnDefs(columns, enableRowSelection),
    [columns, enableRowSelection],
  )
  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])

  // 화면의 컬럼이 바뀌어도 맞도록 매번 정리한 값을 쓴다
  const columnOrder = resolveColumnOrder(defaultOrder, columnOrderSetting)
  const hidden = resolveHidden(columns, hiddenSetting)
  const widths = resolveWidths(columns, widthSetting)
  const columnVisibility: ColumnVisibilityState = Object.fromEntries(
    hidden.map((columnId) => [columnId, false]),
  )
  const tableColumnOrder: ColumnOrderState = enableRowSelection
    ? [SELECT_COLUMN_ID, ...columnOrder]
    : columnOrder

  // 설정이 바뀌면 저장 (처음 그릴 때와 같은 값이면 저장하지 않음)
  const settings = buildSettings({
    columnOrder,
    hidden,
    widths,
    density,
    pageSize: state.pageSize,
    sorting: state.sorting,
  })
  const snapshot = JSON.stringify(settings)
  const lastSnapshot = useRef(snapshot)
  useEffect(() => {
    if (snapshot === lastSnapshot.current) return
    lastSnapshot.current = snapshot
    settingsStore.save(id, JSON.parse(snapshot) as GridSettings)
  }, [snapshot, id, settingsStore])

  // 기본값 되돌리기: 저장값을 지우고 처음 모습으로
  function resetSettings() {
    settingsStore.reset(id)
    lastSnapshot.current = JSON.stringify(
      buildSettings({
        columnOrder: defaultOrder,
        hidden: [],
        widths: {},
        density: 'compact',
        pageSize: DEFAULT_PAGE_SIZE,
        sorting: [],
      }),
    )
    setColumnOrder(defaultOrder)
    setHidden([])
    setWidths({})
    setDensity('compact')
    onStateChange({ ...state, pageSize: DEFAULT_PAGE_SIZE, sorting: [], pageIndex: 0 })
  }

  // 컬럼 순서 한 칸 옮기기 (delta: -1 위로, 1 아래로)
  function moveColumn(columnId: string, delta: -1 | 1) {
    const from = columnOrder.indexOf(columnId)
    const to = from + delta
    if (from < 0 || to < 0 || to >= columnOrder.length) return
    const next = [...columnOrder]
    ;[next[from], next[to]] = [next[to], next[from]]
    setColumnOrder(next)
  }

  // 전체 건수가 줄어 현재 페이지가 없어지면(예: 5페이지를 보는데 다른 사람이 삭제해 3페이지가 됨)
  // 마지막 페이지로 옮기라고 알린다. 로딩 중에는 아직 새 건수를 모르므로 기다린다
  const lastPageIndex = getPageCount(rowCount, state.pageSize) - 1
  const moveToLastPage = useEffectEvent(() =>
    onStateChange(changePageIndex(state, lastPageIndex, rowCount)),
  )
  useEffect(() => {
    if (!loading && state.pageIndex > lastPageIndex) moveToLastPage()
  }, [loading, state.pageIndex, lastPageIndex])

  const sorting: SortingState = state.sorting
  const pagination: PaginationState = { pageIndex: state.pageIndex, pageSize: state.pageSize }

  // 선택 목록의 최신 값: 화면이 다시 그려지기 전에 연달아 선택해도(빠른 연속 클릭)
  // 이전 선택을 잃지 않도록, 렌더링 시점 값이 아니라 이 최신 값을 기준으로 계산한다
  const latestSelection = useRef<RowSelectionState>({})

  function updateSelection(updater: Updater<RowSelectionState>) {
    const next = resolve(updater, latestSelection.current)
    latestSelection.current = next
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
    state: { sorting, pagination, rowSelection, columnVisibility, columnOrder: tableColumnOrder },
    onSortingChange: (updater) => onStateChange(changeSorting(state, resolve(updater, sorting))),
    onPaginationChange: (updater) => {
      const next = resolve(updater, pagination)
      onStateChange(
        next.pageSize !== state.pageSize
          ? changePageSize(state, next.pageSize)
          : changePageIndex(state, next.pageIndex, rowCount),
      )
    },
    onRowSelectionChange: updateSelection,
    onColumnVisibilityChange: (updater) => {
      const next = resolve(updater, columnVisibility)
      setHidden(Object.keys(next).filter((columnId) => next[columnId] === false))
    },
  })

  const visibleColumns = table.getVisibleLeafColumns()
  const rows = table.getRowModel().rows
  const isFirstLoading = loading && data.length === 0
  const isEmpty = !loading && data.length === 0
  const cellPadding = density === 'compact' ? 'py-1.5' : 'py-3'

  // 내보내기: 화면에 보이는 컬럼만, 보이는 순서대로
  async function handleExport(mode: ExportMode) {
    if (!exportCsv) return
    setExportBusy(true)
    setExportError(null)
    try {
      const allRows = await exportCsv.fetchRows()
      const rowsToExport =
        mode === 'selected' ? allRows.filter((row) => rowSelection[getRowId(row)]) : allRows
      const exportColumns = visibleColumns
        .map((column) => columnById.get(column.id))
        .filter((column): column is DataGridColumn<TData> => column !== undefined)
      downloadTextFile(
        toCsv(exportColumns, rowsToExport),
        csvFileName(exportCsv.fileName),
        'text/csv;charset=utf-8',
      )
    } catch {
      setExportError('내보내기에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      setExportBusy(false)
    }
  }

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
          items: columnOrder.map((columnId) => ({
            id: columnId,
            header: columnById.get(columnId)?.header ?? columnId,
            visible: !hidden.includes(columnId),
            hideable: columnById.get(columnId)?.hideable !== false,
          })),
          onToggle: (columnId, visible) => table.getColumn(columnId)?.toggleVisibility(visible),
          onMove: moveColumn,
          onReset: resetSettings,
        }}
        actions={toolbarActions}
        exporting={
          exportCsv
            ? { totalCount: rowCount, busy: exportBusy, error: exportError, onExport: handleExport }
            : undefined
        }
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
                    style={
                      (widths[column.id] ?? def.width)
                        ? { width: widths[column.id] ?? def.width }
                        : undefined
                    }
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

// 저장할 설정 모양 (항목 순서를 고정해 같은 설정이면 같은 글자가 되게 한다)
function buildSettings(settings: Required<GridSettings>): GridSettings {
  return {
    columnOrder: settings.columnOrder,
    hidden: settings.hidden,
    widths: settings.widths,
    density: settings.density,
    pageSize: settings.pageSize,
    sorting: settings.sorting,
  }
}
