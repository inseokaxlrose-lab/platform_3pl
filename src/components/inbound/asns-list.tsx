'use client'

import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import type { ListFetcher } from '@/components/master-list/use-list-query'
import { ASN_CHANNEL_LABELS } from '@/lib/inbound/asn-schema'
import {
  ASN_CHANNEL_OPTIONS,
  ASN_STATUS_FORMAT,
  ASN_STATUS_OPTIONS,
  PUTAWAY_STATUS_FORMAT,
  PUTAWAY_STATUS_OPTIONS,
} from './asn-status'
import { labelOf } from '@/lib/db-value'

export type AsnRow = {
  id: string
  asnNo: string
  channel: string
  expectedOn: string
  shipperRefNo: string | null
  status: string
  putawayStatus: string
  shipper: string
  center: string
  lineCount: number
  remainingLines: number
  overLines: number
  createdBy: string
  createdAt: Date
}

type Option = { id: string; code: string; name: string }

const columnsOf = (basePath: string, withShipper: boolean): DataGridColumn<AsnRow>[] => [
  {
    id: 'asnNo',
    header: 'ASN 번호',
    accessor: 'asnNo',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `${basePath}/${row.id}`,
  },
  ...(withShipper
    ? [
        {
          id: 'shipper',
          header: '화주사',
          accessor: 'shipper',
          sortable: true,
        } satisfies DataGridColumn<AsnRow>,
      ]
    : []),
  { id: 'center', header: '입고 센터', accessor: 'center', sortable: true },
  {
    id: 'expectedOn',
    header: '입고 예정일',
    accessor: 'expectedOn',
    format: 'date',
    sortable: true,
  },
  {
    id: 'status',
    header: '입고 상태',
    accessor: 'status',
    sortable: true,
    format: { status: ASN_STATUS_FORMAT },
  },
  {
    id: 'putawayStatus',
    header: '적치 상태',
    accessor: 'putawayStatus',
    sortable: true,
    format: { status: PUTAWAY_STATUS_FORMAT },
  },
  { id: 'lineCount', header: '품목 수', accessor: 'lineCount', format: 'number' },
  {
    id: 'remainingLines',
    header: '잔량 줄',
    accessor: 'remainingLines',
    format: 'number',
  },
  {
    id: 'overLines',
    header: '초과 줄',
    accessor: 'overLines',
    format: 'number',
    // 초과가 있으면 눈에 띄게 (0003: 초과 수량을 눈에 띄게 표시)
    cell: (row) =>
      row.overLines > 0 ? (
        <span className="font-medium text-warning">{row.overLines}</span>
      ) : (
        <span className="text-muted-foreground">0</span>
      ),
  },
  { id: 'shipperRefNo', header: '화주사 문서 번호', accessor: 'shipperRefNo' },
  {
    id: 'channel',
    header: '등록 경로',
    accessor: (row) => labelOf(ASN_CHANNEL_LABELS, row.channel),
    defaultHidden: !withShipper,
  },
  {
    id: 'createdAt',
    header: '등록일시',
    accessor: 'createdAt',
    format: 'datetime',
    sortable: true,
  },
]

// ASN 목록 (docs/decisions/0051) — 운영사 화면·화주 포털 공용. 행을 누르면 ASN 화면(진행 현황)
export function AsnsList({
  gridId,
  basePath,
  shippers,
  centers,
  canExport,
  actions,
  listAction,
  title = 'ASN 조회',
  description = '입고예정과 입고·적치 진행 상태입니다. ASN 번호를 누르면 품목별 잔량·초과 수량을 봅니다.',
}: {
  // 다른 작업 화면(검수·확정 등)에서 ASN을 고를 때 제목·설명을 바꾼다
  title?: string
  description?: string
  gridId: string
  // ASN 화면 주소 앞부분 ('/admin/inbound/asn', '/portal/asn')
  basePath: string
  // null이면 화주사 칸·조건을 숨긴다 (화주 포털)
  shippers: Option[] | null
  centers: Option[]
  canExport: boolean
  actions?: React.ReactNode
  listAction: ListFetcher<AsnRow>
}) {
  const searchFields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: shippers ? 'ASN 번호·화주사 문서 번호·화주사' : 'ASN 번호·화주사 문서 번호',
    },
    ...(shippers
      ? [
          {
            key: 'shipper',
            label: '화주사',
            type: 'select',
            options: shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
          } satisfies SearchFieldDef,
        ]
      : []),
    {
      key: 'center',
      label: '입고 센터',
      type: 'select',
      options: centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    { key: 'status', label: '입고 상태', type: 'multi', options: ASN_STATUS_OPTIONS },
    { key: 'expectedOn', label: '입고 예정일', type: 'dateRange', span: 6, detail: true },
    {
      key: 'putaway',
      label: '적치 상태',
      type: 'multi',
      options: PUTAWAY_STATUS_OPTIONS,
      detail: true,
    },
    ...(shippers
      ? [
          {
            key: 'channel',
            label: '등록 경로',
            type: 'multi',
            options: ASN_CHANNEL_OPTIONS,
            detail: true,
          } satisfies SearchFieldDef,
        ]
      : []),
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<AsnRow>({ gridId, fields: searchFields, fetch: listAction })

  return (
    <MasterListPage
      title={title}
      description={description}
      actions={actions}
      gridId={gridId}
      searchFields={searchFields}
      list={list}
      columns={columnsOf(basePath, shippers !== null)}
      getRowId={(row) => row.id}
      rowHref={(row) => `${basePath}/${row.id}`}
      excelName={canExport ? 'ASN' : undefined}
      emptyTitle="등록된 ASN이 없습니다"
    />
  )
}
