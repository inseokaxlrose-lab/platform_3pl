'use client'

import { PauseIcon, PlayIcon } from 'lucide-react'
import { ConfirmDialog } from '@/components/common'
import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { IF_METHOD, SHIPPER_STATUS, SHIPPER_STATUS_BADGE } from '@/lib/shippers/shipper-codes'
import { SHIPPER_INDUSTRY_GROUP, SHIPPER_TYPE_GROUP } from '@/lib/shippers/shipper-schema'
import { changeShippersStatusAction, listShippersAction } from './actions'

type Row = {
  id: string
  code: string
  name: string
  shipperType: string | null
  ceoName: string | null
  phone: string | null
  centers: string | null
  ifMethod: string
  apiEnabled: boolean
  contractStartOn: string | null
  contractEndOn: string | null
  status: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  userCount: number
}

// 연동 방식 배지 (포털은 기본이라 회색)
const IF_METHOD_FORMAT: StatusFormat = Object.fromEntries(
  IF_METHOD.options.map((o) => [
    o.value,
    { label: o.label, tone: o.value === 'PORTAL' ? 'neutral' : 'info' },
  ]),
)

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
    id: 'shipperType',
    header: '화주 유형',
    accessor: 'shipperType',
    sortable: true,
    format: { code: SHIPPER_TYPE_GROUP },
  },
  { id: 'ceoName', header: '대표자', accessor: 'ceoName' },
  { id: 'phone', header: '대표 전화', accessor: 'phone', format: 'phone' },
  // ★ = 기본 센터
  { id: 'centers', header: '이용 센터', accessor: 'centers' },
  {
    id: 'ifMethod',
    header: '연동 방식',
    accessor: 'ifMethod',
    sortable: true,
    format: { status: IF_METHOD_FORMAT },
  },
  { id: 'apiEnabled', header: 'API 사용', accessor: 'apiEnabled', format: 'yn' },
  {
    id: 'contractStartOn',
    header: '계약시작일',
    accessor: 'contractStartOn',
    align: 'center',
    sortable: true,
  },
  {
    id: 'contractEndOn',
    header: '계약종료일',
    // 비어 있으면 자동연장
    accessor: (row) => row.contractEndOn ?? '자동연장',
    align: 'center',
    sortable: true,
  },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    sortable: true,
    format: { status: SHIPPER_STATUS_BADGE },
  },
  {
    id: 'userCount',
    header: '포털 사용자',
    accessor: 'userCount',
    format: 'number',
    defaultHidden: true,
  },
  {
    id: 'sortOrder',
    header: '정렬순서',
    accessor: 'sortOrder',
    format: 'number',
    sortable: true,
    defaultHidden: true,
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

// 화주사 목록 (docs/decisions/0035, 0080): 센터 직원은 자기 센터를 이용하는 화주사만 (서버에서 거른다)
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
      placeholder: '화주사 코드·사용자 정의 코드·화주사명·약칭',
    },
    { key: 'status', label: '상태', type: 'multi', options: SHIPPER_STATUS.options },
    {
      key: 'center',
      label: '이용 센터',
      type: 'select',
      options: centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    {
      key: 'shipperType',
      label: '화주 유형',
      type: 'codeMulti',
      codeGroup: SHIPPER_TYPE_GROUP,
      detail: true,
    },
    {
      key: 'industry',
      label: '업종',
      type: 'codeMulti',
      codeGroup: SHIPPER_INDUSTRY_GROUP,
      detail: true,
    },
    {
      key: 'ifMethod',
      label: '연동 방식',
      type: 'multi',
      options: IF_METHOD.options,
      detail: true,
    },
    { key: 'api', label: 'API 사용', type: 'yn', detail: true },
    { key: 'contractEnd', label: '계약종료일', type: 'dateRange', span: 6, detail: true },
    {
      key: 'businessNumber',
      label: '사업자등록번호',
      type: 'text',
      placeholder: '숫자 일부',
      detail: true,
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-shippers',
    fields,
    fetch: listShippersAction,
    defaultSort: [],
  })

  // 일괄 운영중 / 일시정지: 실행 전에 대상 건수 확인 (일시정지는 사유 필수, 해지된 화주사는 건너뜀)
  const bulkButton = (ids: string[], done: () => void, status: 'ACTIVE' | 'SUSPENDED') => {
    const suspend = status === 'SUSPENDED'
    return (
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant={suspend ? 'destructive' : 'outline'}
            disabled={ids.length === 0}
          >
            {suspend ? <PauseIcon /> : <PlayIcon />}
            {suspend ? '일시정지' : '운영중으로'}
            {ids.length > 0 && ` (${ids.length})`}
          </Button>
        }
        title={`화주사 ${ids.length}곳을 ${suspend ? '일시정지' : '운영중으로'} 바꿀까요?`}
        description={
          suspend
            ? '새 입고·품목 등록을 막습니다. 포털 사용자는 조회만 할 수 있습니다. 해지된 화주사는 바꾸지 않습니다.'
            : '입고 등 모든 업무를 할 수 있게 됩니다. 해지된 화주사는 바꾸지 않습니다.'
        }
        confirmLabel={suspend ? '일시정지' : '운영중으로'}
        destructive={suspend}
        reason={suspend ? { label: '일시정지 사유' } : undefined}
        onConfirm={async (reason) => {
          unwrap(await changeShippersStatusAction({ ids, status, reason: reason ?? '' }))
          done()
        }}
      />
    )
  }

  return (
    <MasterListPage
      title="화주사"
      description="물건 보관·배송을 맡기는 회사를 관리합니다. 계약·운영 설정·이용 센터·연동 방식을 정합니다."
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
                {bulkButton(ids, done, 'SUSPENDED')}
                {bulkButton(ids, done, 'ACTIVE')}
              </>
            )
          : undefined
      }
      excelName={canExport ? '화주사' : undefined}
      emptyTitle="등록된 화주사가 없습니다"
    />
  )
}
