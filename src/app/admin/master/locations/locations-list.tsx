'use client'

import { LayersIcon, PlayIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import {
  DELETED_STATUS_OPTION,
  isDeletedView,
  MasterListPage,
  RestoreButton,
  type SearchFieldDef,
  useListQuery,
} from '@/components/master-list'
import { ExcelUploadDialog } from '@/components/excel-upload'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { locationUploadTemplate } from '@/lib/locations/location-upload-template'
import {
  deleteLocationsAction,
  commitLocationUploadAction,
  listLocationsAction,
  restoreLocationsAction,
  setLocationsActiveAction,
  validateLocationUploadAction,
} from './actions'
import { AddLocationDialog } from './add-location-dialog'
import { EditLocationDialog } from './edit-location-dialog'
import type { WarehouseOption } from './queries'

type Row = {
  id: string
  code: string
  name: string
  remark: string | null
  rowVersion: number
  zone: string | null
  aisle: string | null
  level: string | null
  isActive: boolean
  createdAt: Date
  center: string
  warehouse: string
  protected: boolean
}

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '로케이션 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    cell: (row) => (
      <span className="font-medium">
        {row.code}
        {row.protected && (
          <span className="ml-1.5 text-xs text-muted-foreground">입고대기 기본</span>
        )}
      </span>
    ),
  },
  // 명칭 (0071): 한글 가능, 코드와 같으면 흐리게
  {
    id: 'name',
    header: '명칭',
    accessor: 'name',
    sortable: true,
    cell: (row) =>
      row.name === row.code ? <span className="text-muted-foreground">{row.name}</span> : row.name,
  },
  { id: 'center', header: '센터', accessor: 'center', sortable: true },
  { id: 'warehouse', header: '창고', accessor: 'warehouse', sortable: true },
  { id: 'zone', header: '구역', accessor: 'zone', sortable: true, align: 'center' },
  { id: 'aisle', header: '열', accessor: 'aisle', sortable: true, align: 'center' },
  { id: 'level', header: '단', accessor: 'level', sortable: true, align: 'center' },
  {
    id: 'isActive',
    header: '상태',
    accessor: (row) => String(row.isActive),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  { id: 'remark', header: '비고', accessor: 'remark', width: 240 },
  {
    id: 'createdAt',
    header: '등록일시',
    accessor: 'createdAt',
    format: 'datetime',
    sortable: true,
  },
]

// 로케이션 목록 (docs/decisions/0028): 센터 → 창고 → 구역 고르기, 여러 개 사용 중지·다시 사용·삭제
// 센터 직원은 소속 센터 창고의 로케이션만 (서버에서 거른다)
export function LocationsList({
  warehouses,
  can,
}: {
  // 고를 수 있는 창고 (구역 목록 포함)
  warehouses: WarehouseOption[]
  can: { create: boolean; update: boolean; delete: boolean; export: boolean }
}) {
  // 센터 선택지: 창고 목록에서 센터만 추린다
  const centers = [...new Map(warehouses.map((w) => [w.centerId, w.centerLabel])).entries()]
  const fields: SearchFieldDef[] = [
    { key: 'keyword', label: '코드·명칭', type: 'keyword', span: 3, placeholder: '예: A-01, 도크' },
    {
      key: 'center',
      label: '센터',
      type: 'select',
      options: centers.map(([value, label]) => ({ value, label })),
    },
    {
      key: 'warehouse',
      label: '창고',
      type: 'select',
      dependsOn: ['center'],
      // 센터를 골랐으면 그 센터의 창고만
      options: (values) =>
        warehouses
          .filter((w) => !values.center || w.centerId === values.center)
          .map((w) => ({
            value: w.id,
            label: values.center ? w.label : `${w.centerLabel} · ${w.label}`,
          })),
    },
    {
      key: 'zone',
      label: '구역',
      type: 'select',
      dependsOn: ['warehouse'],
      // 창고를 골랐을 때 그 창고의 구역
      options: (values) =>
        (warehouses.find((w) => w.id === values.warehouse)?.zones ?? []).map((zone) => ({
          value: zone,
          label: zone,
        })),
    },
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      detail: true,
      options: [
        { value: 'ACTIVE', label: '사용' },
        { value: 'INACTIVE', label: '사용 중지' },
        // 지운 로케이션 보기 → [되살리기]
        DELETED_STATUS_OPTION,
      ],
    },
  ]
  const list = useListQuery<Row>({ gridId: 'master-locations', fields, fetch: listLocationsAction })
  // 지금 고른 창고 (한 칸 추가·일괄 생성에서 미리 고름)
  const warehouseId = list.values.warehouse
  // 명칭·비고 수정 팝업 (0071)
  const [editing, setEditing] = useState<Row | null>(null)

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
        title={`로케이션 ${ids.length}개를 ${label}할까요?`}
        description={
          {
            deactivate: '사용 중지한 로케이션에는 새로 적치할 수 없습니다. 기록은 남습니다.',
            activate: undefined,
            delete:
              '한 번도 쓰이지 않은 로케이션만 삭제됩니다. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.',
          }[kind]
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteLocationsAction({ ids }))
          else unwrap(await setLocationsActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  return (
    <>
      <MasterListPage
        title="로케이션"
        description="창고 안의 보관 위치(예: A-01-02 = A구역 1열 2단)를 관리합니다. 여러 칸은 [일괄 생성]으로 한 번에 만듭니다."
        actions={
          can.create && (
            <div className="flex gap-2">
              <AddLocationDialog
                warehouses={warehouses}
                initialWarehouseId={warehouseId}
                onAdded={list.refresh}
              />
              {/* 범위 규칙에 맞지 않는 창고: 엑셀로 한 줄씩 (0071) */}
              <ExcelUploadDialog
                template={locationUploadTemplate}
                title="로케이션 엑셀 업로드"
                description="한 줄이 로케이션 하나입니다. 이미 있는 코드는 건너뛰고, 오류가 하나라도 있으면 파일 전체가 등록되지 않습니다."
                validate={validateLocationUploadAction}
                commit={commitLocationUploadAction}
                onDone={list.refresh}
              />
              <Button asChild>
                <Link
                  href={`/admin/master/locations/bulk${warehouseId ? `?warehouseId=${warehouseId}` : ''}`}
                >
                  <LayersIcon />
                  일괄 생성
                </Link>
              </Button>
            </div>
          )
        }
        gridId="master-locations"
        searchFields={fields}
        list={list}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        // 줄을 누르면 명칭·비고 수정 ("삭제됨" 보기에서는 열지 않는다)
        onRowClick={isDeletedView(list.values) ? undefined : (row) => setEditing(row)}
        bulkActions={
          // "삭제됨" 보기에서는 [되살리기]만 (삭제 권한)
          isDeletedView(list.values)
            ? can.delete
              ? ({ ids, done }) => (
                  <RestoreButton
                    ids={ids}
                    noun="로케이션"
                    restore={(restoreIds) => restoreLocationsAction({ ids: restoreIds })}
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
        excelName={can.export ? '로케이션' : undefined}
        emptyTitle="등록된 로케이션이 없습니다"
      />
      <EditLocationDialog
        location={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        readOnly={!can.update}
        onSaved={list.refresh}
      />
    </>
  )
}
