'use client'

import { useState } from 'react'
import { createDataGridState, DataGrid, type DataGridColumn } from '@/components/data-grid'
import type { AsnForEdit } from '@/lib/inbound/asn-queries'
import { formatQty } from '@/lib/units/convert'

type ProgressRow = AsnForEdit['progress'][number]

// 수량 칸: 기본단위 붙여 쉼표 (0은 흐리게)
const qty = (key: keyof ProgressRow, header: string, emphasize?: 'warning' | 'danger') =>
  ({
    id: key,
    header,
    accessor: (row) => row[key],
    align: 'right',
    cell: (row) => {
      const value = String(row[key])
      if (value === '0') return <span className="text-muted-foreground">0</span>
      return (
        <span
          className={
            emphasize === 'warning'
              ? 'font-medium text-warning tabular-nums'
              : emphasize === 'danger'
                ? 'font-medium text-destructive tabular-nums'
                : 'tabular-nums'
          }
        >
          {formatQty(value)} {row.baseUnit}
        </span>
      )
    },
  }) satisfies DataGridColumn<ProgressRow>

const COLUMNS: DataGridColumn<ProgressRow>[] = [
  { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56, pinned: true },
  { id: 'item', header: '품목', accessor: 'item', pinned: true },
  { id: 'lotNo', header: '예정 로트', accessor: 'lotNo', defaultHidden: true },
  qty('expectedQty', '예정'),
  qty('confirmedQty', '누적 확정'),
  qty('remainingQty', '잔량', 'danger'),
  qty('overQty', '초과', 'warning'),
  qty('putawayQty', '적치'),
  qty('putawayableQty', '적치 가능'),
  qty('closedQty', '마감'),
]

// ASN 라인별 진행 현황 (0051): 예정 / 누적 확정 / 잔량 / 초과 / 적치 — 모두 기본단위
export function AsnProgressGrid({ rows }: { rows: ProgressRow[] }) {
  const [state, setState] = useState(() => createDataGridState())
  const page = rows.slice(state.pageIndex * state.pageSize, (state.pageIndex + 1) * state.pageSize)
  return (
    <DataGrid
      id="inbound-asn-progress"
      columns={COLUMNS}
      data={page}
      rowCount={rows.length}
      state={state}
      onStateChange={setState}
      getRowId={(row) => String(row.lineNo)}
      searchable={false}
    />
  )
}
