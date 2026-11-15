'use client'

import { RotateCcwIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AppPage } from '@/components/app-page'
import type { RowData } from '@tanstack/react-table'
import { DataGrid, type DataGridColumn } from '@/components/data-grid'
import { Button } from '@/components/ui/button'
import { SearchPanel } from './search-panel'
import type { SearchFieldDef } from './search-fields'
import type { ListQuery } from './use-list-query'

type MasterListPageProps<TRow extends RowData> = {
  title: string
  description?: React.ReactNode
  // 설명 다음 줄 (상태 배지 등)
  meta?: React.ReactNode
  // 제목 오른쪽 버튼 (예: [신규 등록]) — 권한 검사는 화면에서 (<Can> 또는 서버에서 계산한 값)
  actions?: React.ReactNode
  // DataGrid id (사용자별 설정 저장 키, useListQuery의 gridId와 같게)
  gridId: string
  searchFields: readonly SearchFieldDef[]
  // useListQuery의 반환값
  list: ListQuery<TRow>
  columns: DataGridColumn<TRow>[]
  getRowId: (row: TRow) => string
  // 행을 누르면 갈 주소 (보통 상세·수정 화면)
  rowHref?: (row: TRow) => string
  // 주소 이동 대신 화면 안에서 처리 (예: 수정 팝업 열기). rowHref보다 우선
  onRowClick?: (row: TRow) => void
  // 일괄 처리 버튼: 주면 행 체크박스가 생긴다. 선택이 없으면 버튼을 끄고,
  // 처리 뒤 done()을 부르면 선택을 비우고 목록을 다시 읽는다
  bulkActions?: (selection: { ids: string[]; done: () => void }) => React.ReactNode
  // 엑셀 파일 이름 앞부분 (예: '센터' → 센터_20261115_1405.xlsx). 없으면 엑셀 버튼 없음 (권한 없을 때 등)
  excelName?: string
  // 조건 없이 비었을 때 문구 (예: '등록된 센터가 없습니다')
  emptyTitle?: string
}

// 기준정보 목록 화면 틀: 헤더 + 검색 영역 + 결과 툴바 + 그리드 + 페이지 (docs/ui-guidelines.md)
// 화면 파일에는 검색 조건 정의 + 컬럼 정의 + 조회 함수 + 화면 전용 로직만 둔다
export function MasterListPage<TRow extends RowData>({
  title,
  description,
  meta,
  actions,
  gridId,
  searchFields,
  list,
  columns,
  getRowId,
  rowHref,
  onRowClick,
  bulkActions,
  excelName,
  emptyTitle = '조회된 데이터가 없습니다',
}: MasterListPageProps<TRow>) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // 일괄 처리 뒤 선택을 비우려고 그리드를 새로 그린다 (개인 설정은 보관함에 있어 그대로)
  const [selectionKey, setSelectionKey] = useState(0)

  const done = () => {
    setSelectedIds([])
    setSelectionKey((k) => k + 1)
    list.refresh()
  }

  const empty = !list.searched
    ? { title: '조회 조건을 정하고 [조회]를 누르세요' }
    : list.hasConditions
      ? {
          title: '조건에 맞는 결과가 없습니다',
          description: '조건을 바꾸거나 초기화해 보세요.',
          action: (
            <Button type="button" variant="outline" onClick={list.reset}>
              <RotateCcwIcon />
              조건 초기화
            </Button>
          ),
        }
      : { title: emptyTitle }

  return (
    // 공통 페이지 틀: 화면 전체 폭 (검색 영역·그리드는 카드, 사이 간격은 section 토큰)
    <AppPage title={title} description={description} meta={meta} actions={actions}>
      <SearchPanel
        fields={searchFields}
        values={list.values}
        onSearch={list.search}
        onReset={list.reset}
      />
      <DataGrid
        key={selectionKey}
        id={gridId}
        columns={columns}
        data={list.rows}
        rowCount={list.rowCount}
        state={list.grid}
        onStateChange={list.setGrid}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        getRowId={getRowId}
        searchable={false}
        enableRowSelection={Boolean(bulkActions)}
        onSelectionChange={setSelectedIds}
        toolbarActions={bulkActions?.({ ids: selectedIds, done })}
        onRowClick={onRowClick ?? (rowHref ? (row) => router.push(rowHref(row)) : undefined)}
        exportExcel={excelName ? { fileName: excelName, fetchRows: list.fetchAll } : undefined}
        empty={empty}
      />
    </AppPage>
  )
}
