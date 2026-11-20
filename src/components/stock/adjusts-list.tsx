'use client'

import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import type { ListFetcher } from '@/components/master-list/use-list-query'
import { ADJUST_STATUS_LABELS, ADJUST_TYPE_LABELS } from '@/lib/stock/adjust-schema'
import { labelOf } from '@/lib/db-value'

export type AdjustRow = {
  id: string
  adjustNo: string
  type: string
  status: string
  center: string
  reason: string
  lineCount: number
  createdAt: Date
  createdBy: string
  confirmedAt: Date | null
  confirmedBy: string | null
}

const STATUS_FORMAT: StatusFormat = {
  DRAFT: { label: ADJUST_STATUS_LABELS.DRAFT, tone: 'info' },
  CONFIRMED: { label: ADJUST_STATUS_LABELS.CONFIRMED, tone: 'success' },
  CANCELED: { label: ADJUST_STATUS_LABELS.CANCELED, tone: 'neutral' },
}

const COLUMNS: DataGridColumn<AdjustRow>[] = [
  {
    id: 'adjustNo',
    header: '번호',
    accessor: 'adjustNo',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/stock/adjustments/${row.id}`,
  },
  {
    id: 'type',
    header: '유형',
    accessor: (r) => labelOf(ADJUST_TYPE_LABELS, r.type),
    sortable: true,
  },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    sortable: true,
    format: { status: STATUS_FORMAT },
  },
  { id: 'center', header: '센터', accessor: 'center' },
  { id: 'reason', header: '사유', accessor: 'reason' },
  { id: 'lineCount', header: '줄 수', accessor: 'lineCount', format: 'number' },
  { id: 'createdBy', header: '등록자', accessor: 'createdBy' },
  {
    id: 'createdAt',
    header: '등록 일시',
    accessor: 'createdAt',
    format: 'datetime',
    sortable: true,
  },
  { id: 'confirmedBy', header: '확정자', accessor: 'confirmedBy' },
  { id: 'confirmedAt', header: '확정 일시', accessor: 'confirmedAt', format: 'datetime' },
]

// 실사·조정 목록 (docs/decisions/0061)
export function AdjustsList({
  centers,
  actions,
  listAction,
}: {
  centers: { id: string; code: string; name: string }[]
  actions?: React.ReactNode
  listAction: ListFetcher<AdjustRow>
}) {
  const searchFields: SearchFieldDef[] = [
    { key: 'keyword', label: '검색어', type: 'keyword', span: 4, placeholder: '번호·사유·등록자' },
    {
      key: 'center',
      label: '센터',
      type: 'select',
      options: centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    {
      key: 'type',
      label: '유형',
      type: 'segment',
      options: [
        { value: 'COUNT', label: '실사' },
        { value: 'ADJUST', label: '조정' },
      ],
    },
    {
      key: 'status',
      label: '상태',
      type: 'multi',
      options: Object.entries(ADJUST_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<AdjustRow>({
    gridId: 'stock-adjustments',
    fields: searchFields,
    fetch: listAction,
  })
  return (
    <MasterListPage
      title="실사·조정"
      description="재고 실사 차이와 재고 조정입니다. 작업자가 등록하고 관리자가 확정하면 재고가 바뀝니다."
      actions={actions}
      gridId="stock-adjustments"
      searchFields={searchFields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/stock/adjustments/${row.id}`}
      emptyTitle="등록된 실사·조정이 없습니다"
    />
  )
}
