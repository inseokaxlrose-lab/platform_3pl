'use client'

import { PlayIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { SIDO_LIST } from '@/config/korea-regions'
import { unwrap } from '@/lib/actions'
import { summarizeRegions } from '@/lib/delivery-zones/regions'
import {
  deleteDeliveryZonesAction,
  listDeliveryZonesAction,
  setDeliveryZonesActiveAction,
} from './actions'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  center: string
  regionCodes: string[]
  regionCount: number
}

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '권역 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/master/delivery-zones/${row.id}`,
  },
  { id: 'name', header: '권역명', accessor: 'name', sortable: true, hideable: false, pinned: true },
  { id: 'center', header: '센터', accessor: 'center', sortable: true },
  {
    id: 'systemCode',
    header: '시스템 코드',
    accessor: 'systemCode',
    align: 'center',
    defaultHidden: true,
  },
  // 담당 지역 요약 (엑셀에는 전체 목록)
  {
    id: 'regions',
    header: '담당 지역',
    accessor: (row) => summarizeRegions(row.regionCodes, 99),
    cell: (row) => (
      <span className="block max-w-96 truncate" title={summarizeRegions(row.regionCodes, 99)}>
        {summarizeRegions(row.regionCodes)}
      </span>
    ),
  },
  { id: 'regionCount', header: '지역 수', accessor: 'regionCount', format: 'number' },
  {
    id: 'isActive',
    header: '상태',
    accessor: (row) => String(row.isActive),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  { id: 'createdAt', header: '등록일', accessor: 'createdAt', format: 'date', sortable: true },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
    defaultHidden: true,
  },
]

// 배송권역 목록 (docs/decisions/0033): 센터 직원은 소속 센터 권역만 (서버에서 거른다)
export function DeliveryZonesList({
  centers,
  actions,
  can,
}: {
  centers: { id: string; code: string; name: string }[]
  actions?: React.ReactNode
  can: { update: boolean; delete: boolean; export: boolean }
}) {
  // 검색 조건 (키는 서버 listDeliveryZonesAction의 filters와 같게)
  const fields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '권역 코드·시스템 코드·권역명·센터',
    },
    {
      key: 'center',
      label: '센터',
      type: 'select',
      options: centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      options: [
        { value: 'ACTIVE', label: '사용' },
        { value: 'INACTIVE', label: '사용 중지' },
      ],
    },
    {
      key: 'sido',
      label: '담당 시·도',
      type: 'select',
      detail: true,
      options: SIDO_LIST.map((s) => ({ value: s.code, label: s.name })),
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-delivery-zones',
    fields,
    fetch: listDeliveryZonesAction,
  })

  const bulk = (ids: string[], done: () => void, kind: 'deactivate' | 'activate' | 'delete') => {
    const label = { deactivate: '사용 중지', activate: '다시 사용', delete: '삭제' }[kind]
    return (
      <ConfirmDialog
        key={kind}
        trigger={
          <Button
            type="button"
            variant={kind === 'activate' ? 'outline' : 'destructive'}
            disabled={ids.length === 0}
          >
            {kind === 'delete' ? (
              <Trash2Icon />
            ) : kind === 'activate' ? (
              <PlayIcon />
            ) : (
              <PowerIcon />
            )}
            {label}
            {ids.length > 0 && ` (${ids.length})`}
          </Button>
        }
        title={`배송권역 ${ids.length}개를 ${label}할까요?`}
        description={
          kind === 'delete'
            ? '출고에 쓰인 적 없는 권역만 지워집니다. 담당 지역도 함께 지워지고 되돌릴 수 없습니다.'
            : undefined
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteDeliveryZonesAction({ ids }))
          else unwrap(await setDeliveryZonesActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  return (
    <MasterListPage
      title="배송권역"
      description="센터가 배송을 담당하는 지역을 권역으로 묶습니다. 같은 센터 안에서 한 지역은 권역 하나에만 속합니다."
      actions={actions}
      gridId="master-delivery-zones"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/master/delivery-zones/${row.id}`}
      bulkActions={
        can.update || can.delete
          ? ({ ids, done }) => (
              <>
                {can.update && bulk(ids, done, 'deactivate')}
                {can.update && bulk(ids, done, 'activate')}
                {can.delete && bulk(ids, done, 'delete')}
              </>
            )
          : undefined
      }
      excelName={can.export ? '배송권역' : undefined}
      emptyTitle="등록된 배송권역이 없습니다"
    />
  )
}
