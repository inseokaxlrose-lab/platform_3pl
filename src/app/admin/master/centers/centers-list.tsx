'use client'

import { PauseIcon, PlayIcon } from 'lucide-react'
import { ConfirmDialog } from '@/components/common'
import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { TEMP_ZONE } from '@/config/operator-codes'
import { unwrap } from '@/lib/actions'
import { CENTER_STATUS, CENTER_STATUS_BADGE, CENTER_TYPE } from '@/lib/centers/center-status'
import { changeCentersStatusAction, listCentersAction } from './actions'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  type: string
  status: string
  regionName: string | null
  phone: string | null
  manager: string | null
  storageAreaM2: string | null
  tempZones: string[]
  shipperCount: number
  locationCount: number
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

// 센터 유형 이름표 (색 없이)
const TYPE_FORMAT: StatusFormat = Object.fromEntries(
  CENTER_TYPE.options.map((o) => [o.value, { label: o.label, tone: 'neutral' as const }]),
)

// ── 검색 조건 (키는 서버 listCentersAction의 filters와 같게)
const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: 'keyword',
    label: '검색어',
    type: 'keyword',
    span: 4,
    placeholder: '센터코드·시스템 코드·센터명·약칭',
  },
  { key: 'status', label: '운영 상태', type: 'multi', options: CENTER_STATUS.options },
  { key: 'type', label: '센터 유형', type: 'multi', options: CENTER_TYPE.options },
  { key: 'region', label: '지역', type: 'text', placeholder: '예: 경기, 이천', detail: true },
  {
    key: 'tempZone',
    label: '취급 온도대',
    type: 'multi',
    options: TEMP_ZONE.options,
    detail: true,
  },
  { key: 'bonded', label: '보세', type: 'yn', ynLabels: ['보세', '일반'], detail: true },
  { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
]

// ── 컬럼 (기본 정렬: 정렬순서 → 센터코드)
const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '센터코드',
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
  { id: 'type', header: '유형', accessor: 'type', sortable: true, format: { status: TYPE_FORMAT } },
  {
    id: 'status',
    header: '운영 상태',
    accessor: 'status',
    sortable: true,
    format: { status: CENTER_STATUS_BADGE },
  },
  { id: 'regionName', header: '지역', accessor: 'regionName', sortable: true },
  { id: 'phone', header: '대표 전화', accessor: 'phone', format: 'phone' },
  { id: 'manager', header: '대표 담당자', accessor: 'manager' },
  {
    id: 'storageAreaM2',
    header: '보관면적(m²)',
    accessor: 'storageAreaM2',
    format: 'number',
    sortable: true,
  },
  {
    id: 'tempZones',
    header: '취급 온도대',
    accessor: (row) =>
      row.tempZones
        .map((z) => TEMP_ZONE.labels[z as keyof typeof TEMP_ZONE.labels] ?? z)
        .join(', '),
  },
  { id: 'shipperCount', header: '이용 화주사', accessor: 'shipperCount', format: 'number' },
  { id: 'locationCount', header: '로케이션 수', accessor: 'locationCount', format: 'number' },
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

// 센터 목록 (docs/decisions/0026·0073): 센터 직원은 소속 센터만 (서버에서 거른다)
export function CentersList({
  actions,
  canBulkUpdate,
  canExport,
}: {
  // [센터 등록] 버튼 (등록 권한 + 전체 범위일 때만 page에서 넘긴다)
  actions?: React.ReactNode
  // 일괄 운영중·일시중지 (수정 권한 + 전체 범위)
  canBulkUpdate: boolean
  canExport: boolean
}) {
  const list = useListQuery<Row>({
    gridId: 'master-centers',
    fields: SEARCH_FIELDS,
    fetch: listCentersAction,
    defaultSort: [],
  })

  // 일괄 운영중 / 일시중지: 실행 전에 대상 건수 확인 (일시중지는 사유 필수, 폐쇄된 센터는 건너뜀)
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
            {suspend ? '일시중지' : '운영중으로'}
            {ids.length > 0 && ` (${ids.length})`}
          </Button>
        }
        title={`센터 ${ids.length}곳을 ${suspend ? '일시중지' : '운영중으로'} 바꿀까요?`}
        description={
          suspend
            ? '새 업무와 설정 변경을 막습니다. 폐쇄된 센터는 바꾸지 않습니다.'
            : '모든 업무를 할 수 있게 됩니다. 폐쇄된 센터는 바꾸지 않습니다.'
        }
        confirmLabel={suspend ? '일시중지' : '운영중으로'}
        destructive={suspend}
        reason={suspend ? { label: '일시중지 사유' } : undefined}
        onConfirm={async (reason) => {
          unwrap(await changeCentersStatusAction({ ids, status, reason: reason ?? '' }))
          done()
        }}
      />
    )
  }

  return (
    <MasterListPage
      title="센터"
      description="물류센터를 등록합니다. 등록하면 입고·출고·반품 대기 창고와 기본 로케이션이 자동으로 만들어집니다."
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
                {bulkButton(ids, done, 'SUSPENDED')}
                {bulkButton(ids, done, 'ACTIVE')}
              </>
            )
          : undefined
      }
      excelName={canExport ? '센터' : undefined}
      emptyTitle="등록된 센터가 없습니다"
    />
  )
}
