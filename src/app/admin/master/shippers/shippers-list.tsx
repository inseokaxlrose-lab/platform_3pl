'use client'

import { PlayIcon, PowerIcon } from 'lucide-react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { listShippersAction, setShippersActiveAction } from './actions'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  businessNumber: string | null
  phone: string | null
  centers: string | null
  useLot: boolean
  useExpiry: boolean
  labelUnit: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  userCount: number
}

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '화주사 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/master/shippers/${row.id}`,
  },
  {
    id: 'name',
    header: '화주사명',
    accessor: 'name',
    sortable: true,
    hideable: false,
    pinned: true,
  },
  {
    id: 'systemCode',
    header: '시스템 코드',
    accessor: 'systemCode',
    align: 'center',
    defaultHidden: true,
  },
  { id: 'businessNumber', header: '사업자등록번호', accessor: 'businessNumber', format: 'bizNo' },
  { id: 'phone', header: '대표 전화', accessor: 'phone', format: 'phone', defaultHidden: true },
  { id: 'centers', header: '이용 센터', accessor: 'centers' },
  { id: 'useLot', header: '로트', accessor: 'useLot', format: 'yn' },
  { id: 'useExpiry', header: '유통기한', accessor: 'useExpiry', format: 'yn' },
  { id: 'labelUnit', header: '라벨 단위', accessor: 'labelUnit', align: 'center' },
  { id: 'userCount', header: '포털 사용자', accessor: 'userCount', format: 'number' },
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

// 화주사 목록 (docs/decisions/0035): 센터 직원은 자기 센터를 이용하는 화주사만 (서버에서 거른다)
export function ShippersList({
  centers,
  actions,
  canBulkUpdate,
  canExport,
}: {
  centers: { id: string; code: string; name: string }[]
  actions?: React.ReactNode
  canBulkUpdate: boolean
  canExport: boolean
}) {
  // 검색 조건 (키는 서버 listShippersAction의 filters와 같게)
  const fields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '화주사 코드·시스템 코드·화주사명·사업자번호(숫자)',
    },
    {
      key: 'center',
      label: '이용 센터',
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
    { key: 'lot', label: '로트 사용', type: 'yn', detail: true },
    { key: 'expiry', label: '유통기한 사용', type: 'yn', detail: true },
    {
      key: 'labelUnit',
      label: '라벨 단위',
      type: 'segment',
      detail: true,
      options: [
        { value: 'PLT', label: 'PLT' },
        { value: 'BOX', label: 'BOX' },
      ],
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({ gridId: 'master-shippers', fields, fetch: listShippersAction })

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
      title={`화주사 ${ids.length}곳을 ${isActive ? '다시 사용' : '사용 중지'}할까요?`}
      description={
        isActive
          ? '소속 사용자가 다시 데이터를 볼 수 있게 됩니다.'
          : '소속 사용자는 데이터를 볼 수 없게 됩니다. 기록은 남습니다.'
      }
      confirmLabel={isActive ? '다시 사용' : '사용 중지'}
      destructive={!isActive}
      onConfirm={async () => {
        unwrap(await setShippersActiveAction({ ids, isActive }))
        done()
      }}
    />
  )

  return (
    <MasterListPage
      title="화주사"
      description="물건 보관·배송을 맡기는 회사를 관리합니다. 이용 센터와 품목 기본값(로트·유통기한·라벨 단위)을 정합니다."
      actions={actions}
      gridId="master-shippers"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/master/shippers/${row.id}`}
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
      excelName={canExport ? '화주사' : undefined}
      emptyTitle="등록된 화주사가 없습니다"
    />
  )
}
