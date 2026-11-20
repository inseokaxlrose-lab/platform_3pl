'use client'

import { PlayIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { TEMP_ZONE } from '@/config/operator-codes'
import { ACTIVE_STATUS, ConfirmDialog, StatusBadge } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { CenterSelect } from '@/components/inputs'
import {
  DELETED_STATUS_OPTION,
  MasterListPage,
  RestoreButton,
  isDeletedView,
  useListQuery,
  type SearchFieldDef,
} from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import {
  TEMP_ZONE_BADGE,
  WAREHOUSE_TYPE,
  WAREHOUSE_TYPE_BADGE,
} from '@/lib/warehouses/warehouse-codes'
import {
  deleteWarehousesAction,
  listWarehousesAction,
  restoreWarehousesAction,
  setWarehousesActiveAction,
} from './actions'
import type { CenterOption } from './queries'

type Row = {
  id: string
  code: string
  name: string
  description: string | null
  type: string
  tempZone: string
  isSystem: boolean
  buildingName: string | null
  floorNo: string | null
  areaM2: string | null
  allocatable: boolean
  sortOrder: number
  isActive: boolean
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
  center: string
  locationCount: number
}

const COLUMNS: DataGridColumn<Row>[] = [
  { id: 'center', header: '센터', accessor: 'center', sortable: true, pinned: true },
  {
    id: 'code',
    header: '창고코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    // 코드 + 시스템 기본 창고 배지 + 설명(보조 문구)
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <Link
          href={`/admin/master/warehouses/${row.id}`}
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.code}
        </Link>
        {row.isSystem && <StatusBadge tone="info">기본</StatusBadge>}
        {row.description && (
          <span className="truncate text-xs text-muted-foreground" title={row.description}>
            {row.description}
          </span>
        )}
      </span>
    ),
  },
  { id: 'name', header: '창고명', accessor: 'name', sortable: true, hideable: false },
  {
    id: 'type',
    header: '창고 유형',
    accessor: 'type',
    sortable: true,
    format: { status: WAREHOUSE_TYPE_BADGE },
  },
  {
    id: 'tempZone',
    header: '온도대',
    accessor: 'tempZone',
    sortable: true,
    format: { status: TEMP_ZONE_BADGE },
  },
  { id: 'buildingName', header: '동', accessor: 'buildingName', sortable: true },
  { id: 'floorNo', header: '층', accessor: 'floorNo', sortable: true, align: 'center' },
  {
    id: 'areaM2',
    header: '면적',
    accessor: 'areaM2',
    sortable: true,
    format: { number: { decimals: 2, unit: 'm²' } },
  },
  {
    id: 'allocatable',
    header: '출고 할당 가능',
    accessor: 'allocatable',
    sortable: true,
    format: 'yn',
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
  {
    id: 'sortOrder',
    header: '정렬순서',
    accessor: 'sortOrder',
    sortable: true,
    format: 'number',
    defaultHidden: true,
  },
]

// 창고 목록 (docs/decisions/0027, 0074): 센터 직원은 소속 센터의 창고만 (서버에서 거른다)
export function WarehousesList({
  centers,
  actions,
  can,
}: {
  // 고를 수 있는 센터 (데이터 범위 안)
  centers: CenterOption[]
  actions?: React.ReactNode
  can: { update: boolean; delete: boolean; export: boolean }
}) {
  // 검색 조건 (키는 서버 listWarehousesAction의 filters와 같게)
  const fields: SearchFieldDef[] = [
    {
      key: 'center',
      label: '센터',
      type: 'custom',
      render: ({ id, value, onChange }) => (
        <CenterSelect id={id} options={centers} value={value} onChange={onChange} allowAll />
      ),
    },
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 3,
      placeholder: '창고코드·창고명',
    },
    { key: 'type', label: '창고 유형', type: 'multi', options: WAREHOUSE_TYPE.options },
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      options: [
        { value: 'ACTIVE', label: '사용' },
        { value: 'INACTIVE', label: '사용 중지' },
        // 지운 창고 보기 → [되살리기]
        DELETED_STATUS_OPTION,
      ],
    },
    { key: 'tempZone', label: '온도대', type: 'multi', detail: true, options: TEMP_ZONE.options },
    { key: 'allocatable', label: '출고 할당 가능', type: 'yn', detail: true },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-warehouses',
    fields,
    fetch: listWarehousesAction,
  })

  // 일괄 처리 버튼 하나 (실행 전 대상 건수 확인)
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
        title={`창고 ${ids.length}곳을 ${label}할까요?`}
        description={
          {
            deactivate:
              '재고가 남아 있는 창고는 사용 중지할 수 없습니다. 사용 중지한 창고의 로케이션은 입고·출고 대상에서 빠집니다.',
            activate: '이 창고들을 다시 쓸 수 있게 됩니다.',
            delete:
              '로케이션·재고 기록이 없는 창고만 삭제됩니다. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.',
          }[kind]
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteWarehousesAction({ ids }))
          else unwrap(await setWarehousesActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  const deletedView = isDeletedView(list.values)
  return (
    <MasterListPage
      title="창고"
      description="센터 안에서 용도와 재고 성격이 같은 공간의 묶음입니다. 입고·출고·반품 대기 창고(기본)는 센터마다 자동으로 만들어집니다."
      actions={actions}
      gridId="master-warehouses"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={deletedView ? undefined : (row) => `/admin/master/warehouses/${row.id}`}
      // 시스템 기본 창고는 일괄 처리 대상이 아니다 (사용 중지·삭제 불가)
      canSelectRow={(row) => !row.isSystem}
      bulkActions={
        deletedView
          ? can.delete
            ? ({ ids, done }) => (
                <RestoreButton
                  ids={ids}
                  noun="창고"
                  restore={(restoreIds) => restoreWarehousesAction({ ids: restoreIds })}
                  done={done}
                />
              )
            : undefined
          : can.update || can.delete
            ? ({ ids, done }) => (
                <>
                  {can.update && bulk(ids, done, 'deactivate')}
                  {can.update && bulk(ids, done, 'activate')}
                  {can.delete && bulk(ids, done, 'delete')}
                </>
              )
            : undefined
      }
      excelName={can.export ? '창고' : undefined}
      emptyTitle="등록된 창고가 없습니다"
    />
  )
}
