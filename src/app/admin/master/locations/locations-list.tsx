'use client'

import { LayersIcon, PlayIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { ACTIVE_STATUS, ConfirmDialog, StatusBadge } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { ExcelUploadDialog } from '@/components/excel-upload'
import { CenterSelect, CodeRangeInput, WarehouseSelect, ZoneSelect } from '@/components/inputs'
import {
  DELETED_STATUS_OPTION,
  isDeletedView,
  MasterListPage,
  RestoreButton,
  type SearchFieldDef,
  useListQuery,
} from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { locationUploadTemplate } from '@/lib/locations/location-upload-template'
import {
  commitLocationUploadAction,
  deleteLocationsAction,
  listLocationsAction,
  restoreLocationsAction,
  setLocationsActiveAction,
  validateLocationUploadAction,
} from './actions'
import { LocationDialog, type EditingLocation } from './location-dialog'
import type { LocationOptions } from './queries'

type Row = EditingLocation & {
  description: string | null
  isActive: boolean
  center: string
  warehouse: string
  zone: string | null
  rowNo: string | null
  levelNo: string | null
  bayNo: string | null
  locType: string
  allocatable: boolean
  mixClient: boolean
  maxWeightKg: string | null
  maxPalletCnt: number | null
  hasStock: boolean
  createdAt: Date
  updatedAt: Date
}

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '로케이션 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    // 코드 + 시스템 기본 배지 + 설명(보조 문구)
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="font-medium text-primary">{row.code}</span>
        {row.isSystem && <StatusBadge tone="info">기본</StatusBadge>}
        {row.description && (
          <span className="truncate text-xs text-muted-foreground" title={row.description}>
            {row.description}
          </span>
        )}
      </span>
    ),
  },
  { id: 'center', header: '센터', accessor: 'center', sortable: true },
  { id: 'warehouse', header: '창고', accessor: 'warehouse', sortable: true },
  { id: 'zone', header: '구역', accessor: 'zone', sortable: true, align: 'center' },
  { id: 'rowNo', header: '열', accessor: 'rowNo', sortable: true, align: 'center' },
  { id: 'levelNo', header: '단', accessor: 'levelNo', sortable: true, align: 'center' },
  {
    id: 'bayNo',
    header: '연',
    accessor: 'bayNo',
    sortable: true,
    align: 'center',
    defaultHidden: true,
  },
  {
    id: 'locType',
    header: '로케이션 유형',
    accessor: 'locType',
    sortable: true,
    format: { code: 'LOC_TYPE' },
  },
  // 실제 적용값 (로케이션이 비우면 창고 값)
  { id: 'allocatable', header: '출고 할당 가능', accessor: 'allocatable', format: 'yn' },
  { id: 'mixClient', header: '다화주 혼적', accessor: 'mixClient', sortable: true, format: 'yn' },
  {
    id: 'maxWeightKg',
    header: '최대 중량(kg)',
    accessor: 'maxWeightKg',
    sortable: true,
    format: { number: { decimals: 2 } },
    defaultHidden: true,
  },
  {
    id: 'maxPalletCnt',
    header: '최대 팔레트',
    accessor: 'maxPalletCnt',
    sortable: true,
    format: 'number',
    defaultHidden: true,
  },
  { id: 'hasStock', header: '재고', accessor: 'hasStock', format: 'yn' },
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

// 로케이션 목록 (docs/decisions/0028, 0075): 센터 → 창고 → 구역 고르기, 코드 앞부분·범위 검색
// 여러 개 사용 중지·다시 사용·삭제 (시스템 기본 로케이션은 고를 수 없다), 줄을 누르면 수정 팝업
// 센터 직원은 소속 센터의 로케이션만 (서버에서 거른다)
export function LocationsList({
  options,
  can,
}: {
  options: LocationOptions
  can: { create: boolean; update: boolean; delete: boolean; export: boolean }
}) {
  const { warehouses, zones } = options
  // 센터 선택지: 창고 목록에서 센터만 추린다 (순서는 서버가 정한 센터 정렬순서 그대로)
  const centers = [
    ...new Map(
      warehouses.map((w) => [
        w.centerId,
        { id: w.centerId, code: w.centerCode, name: w.centerName },
      ]),
    ).values(),
  ]
  // 검색 조건 (키는 서버 listLocationsAction의 filters와 같게)
  const fields: SearchFieldDef[] = [
    { key: 'code', label: '로케이션 코드', type: 'text', placeholder: '앞부분 (예: A-01)' },
    {
      key: 'codeRange',
      label: '코드 범위',
      type: 'custom',
      span: 4,
      render: ({ id, value, onChange }) => (
        <CodeRangeInput
          id={id}
          value={value}
          onChange={onChange}
          placeholder={['A-01-01', 'A-03']}
        />
      ),
    },
    {
      key: 'center',
      label: '센터',
      type: 'custom',
      render: ({ id, value, onChange }) => (
        <CenterSelect id={id} options={centers} value={value} onChange={onChange} allowAll />
      ),
    },
    {
      key: 'warehouse',
      label: '창고',
      type: 'custom',
      dependsOn: ['center'],
      // 센터를 고른 뒤 그 센터의 창고만 (센터에 딸림: 센터가 바뀌면 비운다)
      render: ({ id, value, onChange, values }) => (
        <WarehouseSelect
          id={id}
          options={warehouses}
          centerId={values.center ?? ''}
          value={value}
          onChange={onChange}
          allowAll
        />
      ),
    },
    {
      key: 'zone',
      label: '구역',
      type: 'custom',
      dependsOn: ['warehouse'],
      render: ({ id, value, onChange, values }) => (
        <ZoneSelect
          id={id}
          options={zones}
          warehouseId={values.warehouse ?? ''}
          value={value}
          onChange={onChange}
          allowAll
        />
      ),
    },
    {
      key: 'locType',
      label: '로케이션 유형',
      type: 'codeMulti',
      codeGroup: 'LOC_TYPE',
      detail: true,
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
    { key: 'row', label: '열', type: 'text', span: 2, detail: true },
    { key: 'level', label: '단', type: 'text', span: 2, detail: true },
    { key: 'mixClient', label: '다화주 혼적', type: 'yn', detail: true },
    {
      key: 'stock',
      label: '재고',
      type: 'segment',
      detail: true,
      options: [
        { value: 'EMPTY', label: '빈 로케이션' },
        { value: 'HAS', label: '재고 있음' },
      ],
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-locations',
    fields,
    fetch: listLocationsAction,
    // 로케이션은 건수가 많아 한 페이지 50건 (스펙)
    defaultPageSize: 50,
  })
  // 지금 고른 창고·구역 (한 칸 추가·일괄 생성에서 미리 고름)
  const warehouseId = list.values.warehouse
  const zoneId = list.values.zone
  // 추가·수정 팝업
  const [dialog, setDialog] = useState<{ editing: EditingLocation | null } | null>(null)

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
            deactivate:
              '재고가 남아 있는 로케이션은 사용 중지할 수 없습니다. 사용 중지한 로케이션에는 새로 적치할 수 없고, 기록은 남습니다.',
            activate: undefined,
            delete:
              '재고 기록이 하나도 없는 로케이션만 삭제됩니다. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.',
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

  const deletedView = isDeletedView(list.values)
  return (
    <>
      <MasterListPage
        title="로케이션"
        description="재고가 놓이는 한 칸(예: A-01-02 = A구역 1열 2단)을 관리합니다. 여러 칸은 [일괄 생성]으로 한 번에 만듭니다."
        actions={
          can.create && (
            <div className="flex gap-2">
              {/* 범위 규칙에 맞지 않는 창고: 엑셀로 한 줄씩 (0071) */}
              <ExcelUploadDialog
                template={locationUploadTemplate}
                title="로케이션 엑셀 업로드"
                description="한 줄이 로케이션 하나입니다. 이미 있는 코드는 건너뛰고, 오류가 하나라도 있으면 파일 전체가 등록되지 않습니다."
                validate={validateLocationUploadAction}
                commit={commitLocationUploadAction}
                onDone={list.refresh}
              />
              <Button type="button" variant="outline" onClick={() => setDialog({ editing: null })}>
                <PlusIcon />한 칸 추가
              </Button>
              <Button asChild>
                <Link
                  href={`/admin/master/locations/bulk${warehouseId ? `?warehouseId=${warehouseId}${zoneId ? `&zoneId=${zoneId}` : ''}` : ''}`}
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
        // 줄을 누르면 수정 팝업 ("삭제됨" 보기에서는 열지 않는다)
        onRowClick={deletedView ? undefined : (row) => setDialog({ editing: row })}
        // 시스템 기본 로케이션은 일괄 처리 대상이 아니다 (사용 중지·삭제 불가)
        canSelectRow={(row) => !row.isSystem}
        bulkActions={
          // "삭제됨" 보기에서는 [되살리기]만 (삭제 권한)
          deletedView
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
      <LocationDialog
        options={options}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        editing={dialog?.editing ?? null}
        initialWarehouseId={warehouseId}
        readOnly={dialog?.editing ? !can.update : false}
        onSaved={list.refresh}
      />
    </>
  )
}
