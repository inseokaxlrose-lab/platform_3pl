'use client'

import { useState } from 'react'
import { DataGrid } from './data-grid'
import { createDataGridState } from './state'
import type { DataGridColumn } from './types'

// 화면이 이미 가진 작은 목록을 공통 그리드로 보여 주기 (페이지 나누기만 화면 안에서)
// 예: ASN 진행 현황, 검수 기록 — 서버 검색·정렬이 필요 없는 상세 화면 안의 표
export function LocalDataGrid<TData extends object>({
  id,
  columns,
  rows,
  getRowId,
  empty,
  enableRowSelection,
  onSelectionChange,
}: {
  // 그리드 이름 (사용자별 칸 설정 저장 키)
  id: string
  columns: DataGridColumn<TData>[]
  rows: TData[]
  getRowId: (row: TData) => string
  empty?: { title: string; description?: React.ReactNode }
  // 행 고르기 (예: 라벨을 인쇄할 검수 기록)
  enableRowSelection?: boolean
  onSelectionChange?: (ids: string[]) => void
}) {
  const [state, setState] = useState(() => createDataGridState())
  const page = rows.slice(state.pageIndex * state.pageSize, (state.pageIndex + 1) * state.pageSize)
  return (
    <DataGrid
      id={id}
      columns={columns}
      data={page}
      rowCount={rows.length}
      state={state}
      onStateChange={setState}
      getRowId={getRowId}
      searchable={false}
      empty={empty}
      enableRowSelection={enableRowSelection}
      onSelectionChange={onSelectionChange}
    />
  )
}
