'use client'

import { PlayIcon, PowerIcon } from 'lucide-react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { STORAGE_CONDITION_LABELS, STORAGE_CONDITIONS } from '@/lib/warehouses/warehouse-labels'
import { listCentersAction, setCentersActiveAction } from './actions'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  phone: string | null
  managerName: string | null
  managerPhone: string | null
  address: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  warehouseCount: number
}

// ── 검색 조건 (키는 서버 listCentersAction의 filters와 같게)
const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: 'keyword',
    label: '검색어',
    type: 'keyword',
    span: 4,
    placeholder: '센터 코드·시스템 코드·센터명·주소',
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
  { key: 'phone', label: '대표 전화', type: 'phone', placeholder: '일부만 입력해도 됩니다' },
  { key: 'manager', label: '센터장', type: 'text', detail: true },
  {
    key: 'storage',
    label: '창고 보관 조건',
    type: 'multi',
    detail: true,
    options: STORAGE_CONDITIONS.map((value) => ({ value, label: STORAGE_CONDITION_LABELS[value] })),
  },
  { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
]

// ── 컬럼 (기본 정렬: 센터 코드)
const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '센터 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/master/centers/${row.id}`,
  },
  { id: 'name', header: '센터명', accessor: 'name', sortable: true, hideable: false, pinned: true },
  {
    id: 'systemCode',
    header: '시스템 코드',
    accessor: 'systemCode',
    sortable: true,
    align: 'center',
    defaultHidden: true,
  },
  { id: 'address', header: '주소', accessor: 'address' },
  { id: 'phone', header: '대표 전화', accessor: 'phone', format: 'phone' },
  { id: 'managerName', header: '센터장', accessor: 'managerName', sortable: true },
  {
    id: 'managerPhone',
    header: '센터장 연락처',
    accessor: 'managerPhone',
    format: 'phone',
    defaultHidden: true,
  },
  {
    id: 'isActive',
    header: '상태',
    accessor: (row) => String(row.isActive),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  { id: 'warehouseCount', header: '창고 수', accessor: 'warehouseCount', format: 'number' },
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

// 센터 목록 (docs/decisions/0026): 센터 직원은 소속 센터만 (서버에서 거른다)
export function CentersList({
  actions,
  canBulkUpdate,
  canExport,
}: {
  // [센터 등록] 버튼 (등록 권한 + 전체 범위일 때만 page에서 넘긴다)
  actions?: React.ReactNode
  // 일괄 사용 중지·다시 사용 (수정 권한 + 전체 범위)
  canBulkUpdate: boolean
  canExport: boolean
}) {
  const list = useListQuery<Row>({
    gridId: 'master-centers',
    fields: SEARCH_FIELDS,
    fetch: listCentersAction,
    defaultSort: [],
  })

  // 일괄 사용 중지 / 다시 사용: 실행 전에 대상 건수 확인
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
      title={`센터 ${ids.length}곳을 ${isActive ? '다시 사용' : '사용 중지'}할까요?`}
      description={
        isActive
          ? '소속 직원이 다시 이 센터의 데이터를 볼 수 있게 됩니다.'
          : '사용 중지한 센터는 소속 직원의 데이터 범위에서 빠집니다. 기록은 남습니다.'
      }
      confirmLabel={isActive ? '다시 사용' : '사용 중지'}
      destructive={!isActive}
      onConfirm={async () => {
        unwrap(await setCentersActiveAction({ ids, isActive }))
        done()
      }}
    />
  )

  return (
    <MasterListPage
      title="센터"
      description="물류센터를 등록합니다. 등록하면 입고대기 창고와 기본 로케이션이 자동으로 만들어집니다."
      actions={actions}
      gridId="master-centers"
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/master/centers/${row.id}`}
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
      excelName={canExport ? '센터' : undefined}
      emptyTitle="등록된 센터가 없습니다"
    />
  )
}
