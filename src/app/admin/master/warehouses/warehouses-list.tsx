'use client'

import { PlayIcon, PowerIcon } from 'lucide-react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import {
  STORAGE_CONDITION_LABELS,
  STORAGE_CONDITION_STATUS,
  STORAGE_CONDITIONS,
  WAREHOUSE_TYPE_STATUS,
} from '@/lib/warehouses/warehouse-labels'
import { listWarehousesAction, setWarehousesActiveAction } from './actions'
import type { CenterOption } from './queries'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  type: string
  storageCondition: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  center: string
  locationCount: number
}

const ACTIVE_OPTIONS = [
  { value: 'ACTIVE', label: '사용' },
  { value: 'INACTIVE', label: '사용 중지' },
]

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '창고 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/master/warehouses/${row.id}`,
  },
  { id: 'name', header: '창고명', accessor: 'name', sortable: true, hideable: false, pinned: true },
  { id: 'center', header: '센터', accessor: 'center', sortable: true },
  {
    id: 'systemCode',
    header: '시스템 코드',
    accessor: 'systemCode',
    sortable: true,
    align: 'center',
    defaultHidden: true,
  },
  {
    id: 'type',
    header: '유형',
    accessor: 'type',
    sortable: true,
    format: { status: WAREHOUSE_TYPE_STATUS },
  },
  {
    id: 'storageCondition',
    header: '보관 조건',
    accessor: 'storageCondition',
    sortable: true,
    format: { status: STORAGE_CONDITION_STATUS },
  },
  { id: 'locationCount', header: '로케이션 수', accessor: 'locationCount', format: 'number' },
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

// 창고 목록 (docs/decisions/0027): 센터 직원은 소속 센터의 창고만 (서버에서 거른다)
export function WarehousesList({
  centers,
  actions,
  canBulkUpdate,
  canExport,
}: {
  // 고를 수 있는 센터 (데이터 범위 안)
  centers: CenterOption[]
  actions?: React.ReactNode
  canBulkUpdate: boolean
  canExport: boolean
}) {
  // 검색 조건 (키는 서버 listWarehousesAction의 filters와 같게)
  const fields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '창고 코드·시스템 코드·창고명·센터',
    },
    {
      key: 'center',
      label: '센터',
      type: 'select',
      options: centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    { key: 'status', label: '상태', type: 'segment', options: ACTIVE_OPTIONS },
    {
      key: 'type',
      label: '유형',
      type: 'segment',
      detail: true,
      options: [
        { value: 'GENERAL', label: '일반' },
        { value: 'INBOUND_STAGING', label: '입고대기' },
      ],
    },
    {
      key: 'storage',
      label: '보관 조건',
      type: 'multi',
      detail: true,
      options: STORAGE_CONDITIONS.map((value) => ({
        value,
        label: STORAGE_CONDITION_LABELS[value],
      })),
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-warehouses',
    fields,
    fetch: listWarehousesAction,
  })

  // 일괄 사용 중지 / 다시 사용: 실행 전 대상 건수 확인 (입고대기 창고가 섞이면 서버가 거부)
  const bulkButton = (ids: string[], done: () => void, isActive: boolean) => (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant={isActive ? 'outline' : 'destructive'}
          disabled={ids.length === 0}
        >
          {isActive ? <PlayIcon /> : <PowerIcon />}
          {isActive ? '다시 사용' : '사용 중지'}
          {ids.length > 0 && ` (${ids.length})`}
        </Button>
      }
      title={`창고 ${ids.length}곳을 ${isActive ? '다시 사용' : '사용 중지'}할까요?`}
      description={
        isActive
          ? '이 창고들을 다시 쓸 수 있게 됩니다.'
          : '이 창고와 로케이션에 새로 적치할 수 없게 됩니다. 입고대기 창고는 사용 중지할 수 없습니다.'
      }
      confirmLabel={isActive ? '다시 사용' : '사용 중지'}
      destructive={!isActive}
      onConfirm={async () => {
        unwrap(await setWarehousesActiveAction({ ids, isActive }))
        done()
      }}
    />
  )

  return (
    <MasterListPage
      title="창고"
      description="센터 안의 보관 구역을 관리합니다. 입고대기 창고는 센터마다 자동으로 하나씩 있습니다."
      actions={actions}
      gridId="master-warehouses"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/master/warehouses/${row.id}`}
      bulkActions={
        canBulkUpdate
          ? ({ ids, done }) => (
              <>
                {bulkButton(ids, done, false)}
                {bulkButton(ids, done, true)}
              </>
            )
          : undefined
      }
      excelName={canExport ? '창고' : undefined}
      emptyTitle="등록된 창고가 없습니다"
    />
  )
}
