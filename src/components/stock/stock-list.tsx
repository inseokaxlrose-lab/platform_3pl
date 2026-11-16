'use client'

import { StatusBadge } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import type { ListFetcher } from '@/components/master-list/use-list-query'
import { formatQty } from '@/lib/units/convert'

export type StockListRow = {
  id: string
  center: string | null
  warehouse: string | null
  location: string | null
  shipper: string
  itemCode: string
  itemName: string
  spec: string | null
  lotNo: string | null
  expiryOn: string | null
  state: 'NONE' | 'OK' | 'SOON' | 'EXPIRED'
  daysLeft: number | null
  baseUnit: string
  qty: string
  allocatedQty: string
  availableQty: string
  packs: string | null
  locationCount: number
  updatedAt: Date | null
}

type Option = { id: string; code: string; name: string }

// 보기 기준: 비어 있으면 위치별 (기본 보기)
export const STOCK_VIEW_OPTIONS = [
  { value: 'item', label: '품목별' },
  { value: 'lot', label: '로트·유통기한별' },
]

const qtyCell = (value: string, unit: string, muted = false) => (
  <span className={muted ? 'text-muted-foreground tabular-nums' : 'tabular-nums'}>
    {formatQty(value)} {unit}
  </span>
)

// 유통기한 + 상태 배지 (임박·만료)
function ExpiryCell({ row }: { row: StockListRow }) {
  if (!row.expiryOn) return <span className="text-muted-foreground">-</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      {row.expiryOn}
      {row.state === 'SOON' && <StatusBadge tone="warning">임박 D-{row.daysLeft}</StatusBadge>}
      {row.state === 'EXPIRED' && <StatusBadge tone="danger">만료</StatusBadge>}
    </span>
  )
}

function columnsOf(view: string, withShipper: boolean): DataGridColumn<StockListRow>[] {
  const byLocation = view === 'location'
  const withLot = view !== 'item'
  const columns: DataGridColumn<StockListRow>[] = []
  if (byLocation) {
    columns.push(
      { id: 'center', header: '센터', accessor: 'center', sortable: true },
      { id: 'warehouse', header: '창고', accessor: 'warehouse', sortable: true },
      { id: 'location', header: '로케이션', accessor: 'location', sortable: true, pinned: true },
    )
  }
  if (withShipper) {
    columns.push({ id: 'shipper', header: '화주사', accessor: 'shipper', sortable: byLocation })
  }
  columns.push(
    { id: 'item', header: '품목코드', accessor: 'itemCode', sortable: byLocation, pinned: true },
    { id: 'itemName', header: '품목명', accessor: 'itemName' },
    { id: 'spec', header: '규격', accessor: 'spec', defaultHidden: true },
  )
  if (withLot) {
    columns.push(
      { id: 'lotNo', header: '로트번호', accessor: 'lotNo', sortable: byLocation },
      {
        id: 'expiryOn',
        header: '유통기한',
        accessor: 'expiryOn',
        sortable: byLocation,
        cell: (row) => <ExpiryCell row={row} />,
      },
    )
  }
  columns.push(
    {
      id: 'qty',
      header: '재고',
      accessor: 'qty',
      align: 'right',
      sortable: byLocation,
      cell: (r) => qtyCell(r.qty, r.baseUnit),
    },
    {
      id: 'packs',
      header: '환산',
      accessor: 'packs',
      cell: (r) => r.packs ?? <span className="text-muted-foreground">-</span>,
    },
    {
      id: 'allocatedQty',
      header: '할당',
      accessor: 'allocatedQty',
      align: 'right',
      cell: (r) => qtyCell(r.allocatedQty, r.baseUnit, r.allocatedQty === '0'),
    },
    {
      id: 'availableQty',
      header: '가용',
      accessor: 'availableQty',
      align: 'right',
      cell: (r) => qtyCell(r.availableQty, r.baseUnit),
    },
  )
  columns.push(
    byLocation
      ? {
          id: 'updatedAt',
          header: '최근 변경',
          accessor: 'updatedAt',
          format: 'datetime',
          sortable: true,
          defaultHidden: true,
        }
      : {
          id: 'locationCount',
          header: '재고 위치 수',
          accessor: 'locationCount',
          format: 'number',
        },
  )
  return columns
}

// 재고 조회 (docs/decisions/0060) — 운영사 화면·화주 포털 공용
// 보기 기준: 위치별(재고 줄) / 품목별(화주사+품목 합계, 환산단위) / 로트·유통기한별(임박·만료 배지)
export function StockList({
  gridId,
  title,
  description,
  options,
  canExport,
  listAction,
}: {
  gridId: string
  title: string
  description: string
  // shippers가 null이면 화주사 칸·조건을 숨긴다 (화주 포털)
  options: {
    centers: Option[]
    warehouses: (Option & { centerId: string })[]
    shippers: Option[] | null
  }
  canExport: boolean
  listAction: ListFetcher<StockListRow>
}) {
  const searchFields: SearchFieldDef[] = [
    {
      key: 'view',
      label: '보기 기준',
      type: 'segment',
      span: 4,
      allLabel: '위치별',
      options: STOCK_VIEW_OPTIONS,
    },
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '품목코드·품목명·바코드·로케이션·로트',
    },
    {
      key: 'center',
      label: '센터',
      type: 'select',
      options: options.centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    {
      key: 'warehouse',
      label: '창고',
      type: 'select',
      dependsOn: ['center'],
      options: (values) =>
        options.warehouses
          .filter((w) => !values.center || w.centerId === values.center)
          .map((w) => ({ value: w.id, label: `${w.name} (${w.code})` })),
      detail: true,
    },
  ]
  if (options.shippers) {
    searchFields.push({
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: options.shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    })
  }
  searchFields.push(
    {
      key: 'expiry',
      label: '유통기한',
      type: 'segment',
      options: [
        { value: 'SOON', label: '임박' },
        { value: 'EXPIRED', label: '만료' },
      ],
      detail: true,
    },
    { key: 'zero', label: '수량 0 포함', type: 'yn', detail: true },
  )
  const list = useListQuery<StockListRow>({ gridId, fields: searchFields, fetch: listAction })
  const view = list.values.view || 'location'

  return (
    <MasterListPage
      title={title}
      description={description}
      gridId={`${gridId}-${view}`}
      searchFields={searchFields}
      list={list}
      columns={columnsOf(view, options.shippers !== null)}
      getRowId={(row) => row.id}
      excelName={canExport ? '재고' : undefined}
      emptyTitle="재고가 없습니다"
    />
  )
}
