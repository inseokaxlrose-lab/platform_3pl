'use client'

import { StatusBadge } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import type { ListFetcher } from '@/components/master-list/use-list-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { STOCK_STATUS } from '@/config/operator-codes'
import type { ActionResult } from '@/lib/actions'
import { labelOf } from '@/lib/db-value'
import type { StockStatusChangeInput } from '@/lib/stock/stock-status-schema'
import { formatQty } from '@/lib/units/convert'
import { StockStatusBadge, StockStatusDialog, type StockStatusTarget } from './stock-status'

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
  // 제조일 (위치별 보기만, 0089)
  mfgOn: string | null
  state: 'NONE' | 'OK' | 'SOON' | 'EXPIRED'
  daysLeft: number | null
  // 재고상태 (0088): NORMAL·HOLD·DAMAGED·QUARANTINE — 합계 보기도 상태별로 나뉜다
  status: string
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

function columnsOf(
  view: string,
  withShipper: boolean,
  onChangeStatus?: (row: StockListRow) => void,
): DataGridColumn<StockListRow>[] {
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
    if (byLocation) {
      columns.push({
        id: 'mfgOn',
        header: '제조일',
        accessor: 'mfgOn',
        format: 'date',
        defaultHidden: true,
      })
    }
  }
  columns.push(
    {
      id: 'status',
      header: '재고상태',
      accessor: (r) => labelOf(STOCK_STATUS.labels, r.status),
      sortable: byLocation,
      cell: (r) => <StockStatusBadge status={r.status} />,
    },
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
  // 위치별 보기에서만 재고 줄 하나의 상태를 바꾼다 (권한 stock.inventory.update)
  if (byLocation && onChangeStatus) {
    columns.push({
      id: 'statusAction',
      header: '',
      accessor: () => '',
      hideable: false,
      cell: (r) =>
        r.qty !== '0' ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onChangeStatus(r)}>
            상태 변경
          </Button>
        ) : null,
    })
  }
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
  statusAction,
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
  // 있으면 위치별 보기에 [상태 변경] (운영사 화면, 권한 stock.inventory.update)
  statusAction?: (input: StockStatusChangeInput) => Promise<ActionResult<unknown>>
}) {
  const [statusTarget, setStatusTarget] = useState<StockStatusTarget | null>(null)
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
    {
      key: 'status',
      label: '재고상태',
      type: 'select',
      options: STOCK_STATUS.values.map((s) => ({
        value: s,
        label: labelOf(STOCK_STATUS.labels, s),
      })),
      detail: true,
    },
    { key: 'zero', label: '수량 0 포함', type: 'yn', detail: true },
  )
  const list = useListQuery<StockListRow>({ gridId, fields: searchFields, fetch: listAction })
  const view = list.values.view || 'location'

  return (
    <>
      <MasterListPage
        title={title}
        description={description}
        gridId={`${gridId}-${view}`}
        searchFields={searchFields}
        list={list}
        columns={columnsOf(
          view,
          options.shippers !== null,
          statusAction
            ? (row) =>
                setStatusTarget({
                  id: row.id,
                  label: `${row.location} · ${row.itemName} (${row.itemCode})${row.lotNo ? ` · ${row.lotNo}` : ''}`,
                  status: row.status,
                  qty: row.qty,
                  availableQty: row.availableQty,
                  allocatedQty: row.allocatedQty,
                  baseUnit: row.baseUnit,
                })
            : undefined,
        )}
        getRowId={(row) => row.id}
        excelName={canExport ? '재고' : undefined}
        emptyTitle="재고가 없습니다"
      />
      {statusAction && (
        <StockStatusDialog
          target={statusTarget}
          onClose={() => setStatusTarget(null)}
          onDone={() => list.refresh()}
          action={statusAction}
        />
      )}
    </>
  )
}
