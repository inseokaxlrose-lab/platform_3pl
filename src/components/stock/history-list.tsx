'use client'

import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import type { ListFetcher } from '@/components/master-list/use-list-query'
import { formatQty } from '@/lib/units/convert'

export type HistoryRow = {
  id: string
  txnAt: Date
  type: 'RECEIVE' | 'MOVE_OUT' | 'MOVE_IN' | 'ADJUST'
  typeLabel: string
  center: string
  location: string
  shipper: string
  itemCode: string
  itemName: string
  lotNo: string | null
  expiryOn: string | null
  baseUnit: string
  qtyChange: string
  qtyAfter: string
  ref: string | null
  groupId: string | null
  reason: string | null
  createdBy: string
}

const COLUMNS: DataGridColumn<HistoryRow>[] = [
  {
    id: 'txnAt',
    header: '일시',
    accessor: 'txnAt',
    format: 'datetime',
    sortable: true,
    pinned: true,
  },
  { id: 'type', header: '유형', accessor: 'typeLabel', sortable: true },
  { id: 'center', header: '센터', accessor: 'center', defaultHidden: true },
  { id: 'location', header: '로케이션', accessor: 'location' },
  { id: 'shipper', header: '화주사', accessor: 'shipper' },
  { id: 'itemCode', header: '품목코드', accessor: 'itemCode' },
  { id: 'itemName', header: '품목명', accessor: 'itemName' },
  { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
  { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
  {
    id: 'qtyChange',
    header: '변동',
    accessor: 'qtyChange',
    align: 'right',
    sortable: true,
    cell: (r) => (
      <span
        className={
          r.qtyChange.startsWith('-')
            ? 'text-destructive tabular-nums'
            : 'text-primary tabular-nums'
        }
      >
        {r.qtyChange.startsWith('-') ? '' : '+'}
        {formatQty(r.qtyChange)} {r.baseUnit}
      </span>
    ),
  },
  {
    id: 'qtyAfter',
    header: '변동 후',
    accessor: 'qtyAfter',
    align: 'right',
    cell: (r) => (
      <span className="tabular-nums">
        {formatQty(r.qtyAfter)} {r.baseUnit}
      </span>
    ),
  },
  { id: 'ref', header: '원본 문서', accessor: 'ref' },
  { id: 'reason', header: '사유', accessor: 'reason' },
  { id: 'createdBy', header: '처리자', accessor: 'createdBy' },
  { id: 'groupId', header: '묶음 번호', accessor: 'groupId', defaultHidden: true },
]

// 재고 이력 (docs/decisions/0062): 재고가 바뀐 한 번 한 번 — 고치거나 지울 수 없다
export function HistoryList({
  options,
  canExport,
  listAction,
}: {
  options: {
    centers: { id: string; code: string; name: string }[]
    shippers: { id: string; code: string; name: string }[]
  }
  canExport: boolean
  listAction: ListFetcher<HistoryRow>
}) {
  const searchFields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '품목·로케이션·로트·문서 번호·사유·처리자',
    },
    {
      key: 'type',
      label: '유형',
      type: 'multi',
      options: [
        { value: 'RECEIVE', label: '입고' },
        { value: 'MOVE_OUT', label: '이동(나감)' },
        { value: 'MOVE_IN', label: '이동(들어옴)' },
        { value: 'ADJUST', label: '조정' },
      ],
    },
    { key: 'txnAt', label: '기간', type: 'dateRange', span: 6 },
    {
      key: 'center',
      label: '센터',
      type: 'select',
      options: options.centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
      detail: true,
    },
    {
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: options.shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
      detail: true,
    },
    {
      key: 'ref',
      label: '원본 문서',
      type: 'multi',
      options: [
        { value: 'RECEIPT', label: '입고확정' },
        { value: 'PUTAWAY', label: '적치' },
        { value: 'ADJUSTMENT', label: '실사·조정' },
      ],
      detail: true,
    },
  ]
  const list = useListQuery<HistoryRow>({
    gridId: 'stock-history',
    fields: searchFields,
    fetch: listAction,
  })
  return (
    <MasterListPage
      title="재고 이력"
      description="재고가 바뀐 기록입니다 (기본단위). 입고 확정·적치·실사·조정이 남기며 고치거나 지울 수 없습니다."
      gridId="stock-history"
      searchFields={searchFields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      excelName={canExport ? '재고이력' : undefined}
      emptyTitle="재고 이력이 없습니다"
    />
  )
}
