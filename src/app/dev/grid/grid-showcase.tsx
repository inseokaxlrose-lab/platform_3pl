'use client'

import { PrinterIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  createDataGridState,
  DataGrid,
  type DataGridColumn,
  type DataGridState,
} from '@/components/data-grid'
import type { FakeInventoryRow } from './fake-inventory'
import { queryAllFakeInventory, queryFakeInventory } from './fake-server'

const columns: DataGridColumn<FakeInventoryRow>[] = [
  { id: 'centerName', header: '센터', accessor: 'centerName', sortable: true },
  { id: 'location', header: '로케이션', accessor: 'location', sortable: true },
  { id: 'shipperName', header: '화주사', accessor: 'shipperName', sortable: true },
  { id: 'itemCode', header: '품목코드', accessor: 'itemCode', sortable: true, hideable: false },
  { id: 'itemName', header: '품목명', accessor: 'itemName', sortable: true, hideable: false },
  { id: 'lotNo', header: '로트번호', accessor: 'lotNo', sortable: true },
  { id: 'expiryDate', header: '유통기한', accessor: 'expiryDate', format: 'date', sortable: true },
  { id: 'qty', header: '수량', accessor: 'qty', format: 'number', sortable: true },
  { id: 'unit', header: '단위', accessor: 'unit', align: 'center' },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    format: {
      status: {
        NORMAL: { label: '정상', tone: 'success' },
        EXPIRING: { label: '임박', tone: 'warning' },
        HOLD: { label: '보류', tone: 'neutral' },
      },
    },
  },
  {
    id: 'updatedAt',
    header: '최종 변경',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
  },
]

// DataGrid 쇼케이스: 가짜 서버(1,000건)와 연결해 모든 1차 기능을 확인한다
export function GridShowcase() {
  const [state, setState] = useState<DataGridState>(() => createDataGridState())
  const [result, setResult] = useState<{ rows: FakeInventoryRow[]; rowCount: number }>({
    rows: [],
    rowCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 상태가 바뀌면 서버에 다시 묻는다 (늦게 온 이전 응답은 버린다)
  useEffect(() => {
    let cancelled = false
    queryFakeInventory(state).then((next) => {
      if (cancelled) return
      setResult(next)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [state])

  return (
    <>
      <PageHeader
        title="DataGrid 쇼케이스"
        description="가짜 재고 데이터 1,000건 · 가짜 서버 응답 0.4초 지연"
      />
      <DataGrid
        id="dev-grid-showcase"
        columns={columns}
        data={result.rows}
        rowCount={result.rowCount}
        state={state}
        onStateChange={(next) => {
          setState(next)
          setLoading(true)
        }}
        loading={loading}
        getRowId={(row) => row.id}
        enableRowSelection
        onSelectionChange={setSelectedIds}
        searchPlaceholder="품목명·코드·로케이션·화주사·로트 검색"
        exportCsv={{ fileName: '재고목록', fetchRows: () => queryAllFakeInventory(state) }}
        toolbarActions={
          <Button variant="outline" disabled={selectedIds.length === 0}>
            <PrinterIcon />
            선택 라벨 출력
          </Button>
        }
      />
      <p className="mt-3 text-xs text-muted-foreground">
        현재 상태: {JSON.stringify(state)} · 선택 id: {selectedIds.slice(0, 5).join(', ')}
        {selectedIds.length > 5 && ` 외 ${selectedIds.length - 5}건`}
      </p>
    </>
  )
}
