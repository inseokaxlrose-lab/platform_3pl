'use client'

import { LayersIcon, PlayIcon, PowerIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { ExcelUploadDialog } from '@/components/excel-upload'
import {
  DELETED_STATUS_OPTION,
  isDeletedView,
  MasterListPage,
  RestoreButton,
  type SearchFieldDef,
  useListQuery,
} from '@/components/master-list'
import type { ListFetcher } from '@/components/master-list/use-list-query'
import { Button } from '@/components/ui/button'
import { TEMP_ZONE } from '@/config/operator-codes'
import { unwrap } from '@/lib/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { UploadPreview, UploadRow } from '@/lib/excel/upload'
import type { PalletBulkResult } from '@/lib/items/item-bulk'
import {
  ITEM_SOURCE,
  ITEM_STATUS,
  ITEM_STATUS_BADGE,
  ITEM_TYPE,
  VOLUME_STATUS_BADGE,
  type ItemStatus,
} from '@/lib/items/item-codes'
import type { ItemPalletOption } from '@/lib/items/item-form-options'
import { itemUploadTemplate } from '@/lib/items/item-upload-template'
import { ItemPalletBulkDialog } from './item-pallet-bulk-dialog'

export type ItemRow = Row

type Row = {
  id: string
  code: string
  custCode: string | null
  name: string
  spec: string | null
  itemType: string
  category1: string | null
  barcode: string | null
  shipper: string
  baseUnit: string
  units: string | null
  boxQty: string | null
  pltBoxQty: string | null
  boxCbm: string | null
  boxWeightKg: string | null
  tempZone: string
  expiry: string | null
  shelfLifeDays: number | null
  useLot: boolean
  useExpiry: boolean
  labelUnit: string
  labelUnitMissing: boolean
  volumeStatus: string
  expiryAlertDays: number | null
  status: string
  source: string
  lastIfAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// 칸 정의 (basePath: 수정 화면 주소 앞부분, withShipper: 화주사 칸을 보일지 — 화주 포털은 자기 화주사뿐이라 숨김)
// 정의서 6장 순서: 화주 | 품목코드 | 품목명 | 규격 | 유형 | 분류1 | 기본단위 | BOX 입수 | PLT 입수(BOX) | BOX CBM·중량 |
// 온도대 | 기한 관리 | 총 기한 일수 | LOT | 체적 상태 | 상태 | 최근 연동
const columnsOf = (basePath: string, withShipper: boolean): DataGridColumn<Row>[] => [
  ...(withShipper
    ? [
        {
          id: 'shipper',
          header: '화주사',
          accessor: 'shipper',
          sortable: true,
          pinned: true,
        } satisfies DataGridColumn<Row>,
      ]
    : []),
  {
    id: 'code',
    header: '품목코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `${basePath}/${row.id}`,
  },
  { id: 'name', header: '품목명', accessor: 'name', sortable: true },
  { id: 'spec', header: '규격', accessor: 'spec' },
  { id: 'itemType', header: '유형', accessor: 'itemType', sortable: true },
  { id: 'category1', header: '분류1', accessor: 'category1', sortable: true },
  { id: 'barcode', header: '바코드', accessor: 'barcode', defaultHidden: true },
  // 사용자 정의 코드 (화주 시스템의 코드, 0084)
  { id: 'custCode', header: '사용자 정의 코드', accessor: 'custCode', sortable: true },
  { id: 'baseUnit', header: '기본단위', accessor: 'baseUnit' },
  { id: 'boxQty', header: 'BOX 입수', accessor: 'boxQty', align: 'right' },
  { id: 'pltBoxQty', header: 'PLT 입수(BOX)', accessor: 'pltBoxQty', align: 'right' },
  { id: 'units', header: '환산단위', accessor: 'units', defaultHidden: true },
  { id: 'boxCbm', header: 'BOX CBM', accessor: 'boxCbm', align: 'right' },
  { id: 'boxWeightKg', header: 'BOX 중량(kg)', accessor: 'boxWeightKg', align: 'right' },
  { id: 'tempZone', header: '온도대', accessor: 'tempZone', sortable: true },
  // 기한·LOT·라벨은 실제로 적용되는 값
  { id: 'expiry', header: '기한 관리', accessor: 'expiry' },
  {
    id: 'shelfLifeDays',
    header: '총 기한 일수',
    accessor: 'shelfLifeDays',
    format: 'number',
    defaultHidden: true,
  },
  { id: 'useLot', header: 'LOT', accessor: 'useLot', format: 'yn' },
  {
    id: 'labelUnit',
    header: '라벨',
    accessor: 'labelUnit',
    defaultHidden: true,
    // 라벨 단위의 입수량이 없으면 표시 (저장은 되지만 라벨 발행 불가, 0041)
    cell: (row) => (
      <span className="inline-flex items-center gap-1">
        {row.labelUnit}
        {row.labelUnitMissing && (
          <TriangleAlertIcon
            className="size-3.5 text-warning"
            aria-label={`${row.labelUnit} 입수량 없음`}
          >
            <title>{`${row.labelUnit} 입수량 없음 — 라벨을 발행할 수 없습니다`}</title>
          </TriangleAlertIcon>
        )}
      </span>
    ),
  },
  {
    id: 'expiryAlertDays',
    header: '임박 기준(일)',
    accessor: 'expiryAlertDays',
    format: 'number',
    defaultHidden: true,
  },
  {
    id: 'volumeStatus',
    header: '체적',
    accessor: 'volumeStatus',
    format: { status: VOLUME_STATUS_BADGE },
  },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    sortable: true,
    format: { status: ITEM_STATUS_BADGE },
  },
  { id: 'source', header: '등록 경로', accessor: 'source', defaultHidden: true },
  {
    id: 'lastIfAt',
    header: '최근 연동',
    accessor: 'lastIfAt',
    format: 'datetime',
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

type Ids = { ids: string[] }
type PalletBulkInput = Ids & {
  palletTypeCode: string
  palletTi: number | null
  palletHi: number | null
  palletBoxQty: number | null
}

// 운영사 화면에만 있는 기능 (상태 일괄 변경·팔레트 일괄 입력·엑셀 업로드 — 0083 ②, 포털은 목록 개선만)
export type ItemsListAdmin = {
  setStatusAction: (input: Ids & { status: ItemStatus }) => Promise<ActionResult<unknown>>
  palletBulkAction: (input: PalletBulkInput) => Promise<ActionResult<PalletBulkResult>>
  pallets: ItemPalletOption[]
  defaultPalletType: string
  // 등록·수정 권한이 둘 다 있을 때만
  upload?: {
    validate: (rows: UploadRow[]) => Promise<ActionResult<UploadPreview>>
    commit: (rows: UploadRow[]) => Promise<ActionResult<{ message: string }>>
  }
}

const STATUS_ICON: Record<ItemStatus, typeof PlayIcon> = {
  ACTIVE: PlayIcon,
  INACTIVE: PowerIcon,
  DISCONTINUED: PowerIcon,
}
const STATUS_HINT: Record<ItemStatus, string | undefined> = {
  ACTIVE: undefined,
  INACTIVE: '새 입고예정(ASN)과 출고요청에서 고를 수 없게 됩니다. 기록은 남습니다.',
  DISCONTINUED: '새 입고예정(ASN)에서 고를 수 없게 됩니다. 남은 재고는 출고할 수 있습니다.',
}

// 품목 목록 (docs/decisions/0041, 0083): 행을 누르면 수정 화면 — 운영사 화면·화주 포털 공용 (서버 액션은 각자 넘긴다)
export function ItemsList({
  gridId,
  basePath,
  shippers,
  can,
  actions,
  listAction,
  setActiveAction,
  deleteAction,
  restoreAction,
  admin,
}: {
  // 그리드 이름 (사용자별 설정 저장 키)
  gridId: string
  // 수정 화면 주소 앞부분 ('/admin/master/items', '/portal/items')
  basePath: string
  // 화주사 고르기 선택지 (범위 안의 화주사). null이면 화주사 칸·조건을 숨긴다 (화주 포털)
  shippers: { id: string; code: string; name: string }[] | null
  can: { update: boolean; delete: boolean; export: boolean }
  actions?: React.ReactNode
  listAction: ListFetcher<Row>
  // 화주 포털: 사용 중지 / 다시 사용 (운영사 화면은 admin.setStatusAction)
  setActiveAction: (input: Ids & { isActive: boolean }) => Promise<ActionResult<unknown>>
  deleteAction: (input: Ids) => Promise<ActionResult<unknown>>
  restoreAction: (input: Ids) => Promise<ActionResult<{ count: number }>>
  admin?: ItemsListAdmin
}) {
  const [result, setResult] = useState<string | null>(null)
  const searchFields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: shippers ? '품목코드·품목명·바코드·화주사' : '품목코드·품목명·바코드',
    },
    ...(shippers
      ? [
          {
            key: 'shipper',
            label: '화주사',
            type: 'select',
            options: shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
          } satisfies SearchFieldDef,
        ]
      : []),
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      options: [
        ...ITEM_STATUS.options,
        // 지운 품목 보기 → [되살리기]
        DELETED_STATUS_OPTION,
      ],
    },
    { key: 'itemType', label: '품목 유형', type: 'multi', options: ITEM_TYPE.options },
    { key: 'category1', label: '분류1', type: 'text', detail: true },
    { key: 'brand', label: '브랜드', type: 'text', detail: true },
    {
      key: 'tempZone',
      label: '보관 온도대',
      type: 'multi',
      options: TEMP_ZONE.options,
      detail: true,
    },
    { key: 'expiry', label: '기한 관리', type: 'yn', detail: true },
    { key: 'lot', label: 'LOT 관리', type: 'yn', detail: true },
    { key: 'hazmat', label: '위험물', type: 'yn', detail: true },
    {
      key: 'volumeMissing',
      label: '체적',
      type: 'yn',
      ynLabels: ['미등록', '등록'],
      detail: true,
    },
    {
      key: 'pltMissing',
      label: 'PLT 적재',
      type: 'yn',
      ynLabels: ['미등록', '등록'],
      detail: true,
    },
    {
      key: 'source',
      label: '등록 경로',
      type: 'multi',
      options: ITEM_SOURCE.options,
      detail: true,
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({ gridId, fields: searchFields, fetch: listAction })

  // 화주 포털: 사용 중지 / 다시 사용 / 삭제
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
        title={`품목 ${ids.length}개를 ${label}할까요?`}
        description={
          kind === 'delete'
            ? '재고·입고 기록이 없는 품목만 지워집니다. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.'
            : kind === 'deactivate'
              ? '새 입고예정(ASN)에서 고를 수 없게 됩니다. 기록은 남습니다.'
              : undefined
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteAction({ ids }))
          else unwrap(await setActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  // 운영사 화면: 상태 바꾸기 (사용·사용중지·단종)
  const statusButton = (ids: string[], done: () => void, status: ItemStatus) => {
    const label = ITEM_STATUS.labels[status]
    const Icon = STATUS_ICON[status]
    return (
      <ConfirmDialog
        key={status}
        trigger={
          <Button
            type="button"
            variant={status === 'ACTIVE' ? 'outline' : 'destructive'}
            disabled={ids.length === 0}
          >
            <Icon />
            {label}
            {ids.length > 0 && ` (${ids.length})`}
          </Button>
        }
        title={`품목 ${ids.length}개를 '${label}'(으)로 바꿀까요?`}
        description={STATUS_HINT[status]}
        confirmLabel={label}
        destructive={status !== 'ACTIVE'}
        onConfirm={async () => {
          unwrap(await admin!.setStatusAction({ ids, status }))
          done()
        }}
      />
    )
  }

  // 팔레트 일괄 입력 결과 문구
  const reportPallet = (r: PalletBulkResult) => {
    const skipped =
      r.skipped.length > 0
        ? ` · 건너뜀 ${r.skipped.length} (${r.skipped
            .slice(0, 5)
            .map((s) => `${s.code}: ${s.reason}`)
            .join(', ')}${r.skipped.length > 5 ? ' …' : ''})`
        : ''
    const warned = r.warned > 0 ? ` · 확인할 것 ${r.warned}개 (높이·중량 초과 등)` : ''
    setResult(`${r.total}개 중 ${r.applied}개 적용${warned}${skipped}`)
  }

  return (
    <MasterListPage
      title="품목"
      description="화주사가 맡긴 상품입니다. 단위·규격(BOX·PLT), 팔레트 적재, 소비기한·LOT 관리, 바코드를 정합니다."
      actions={
        <>
          {admin?.upload && (
            <ExcelUploadDialog
              template={itemUploadTemplate}
              title="품목 엑셀 업로드"
              description="한 줄이 품목 하나입니다. 이미 있는 품목은 넣은 칸만 고칩니다. 오류가 하나라도 있으면 파일 전체가 등록되지 않습니다."
              validate={admin.upload.validate}
              commit={admin.upload.commit}
              onDone={list.refresh}
            />
          )}
          {actions}
        </>
      }
      gridId={gridId}
      searchFields={searchFields}
      list={list}
      columns={columnsOf(basePath, shippers !== null)}
      getRowId={(row) => row.id}
      // "삭제됨" 보기: 수정 화면 대신 골라서 [되살리기]
      rowHref={isDeletedView(list.values) ? undefined : (row) => `${basePath}/${row.id}`}
      excelName={can.export ? '품목' : undefined}
      bulkActions={
        isDeletedView(list.values)
          ? can.delete
            ? ({ ids, done }) => (
                <RestoreButton
                  ids={ids}
                  noun="품목"
                  restore={(restoreIds) => restoreAction({ ids: restoreIds })}
                  done={done}
                />
              )
            : undefined
          : can.update || can.delete
            ? ({ ids, done }) => (
                <>
                  {result && (
                    <span role="status" className="text-xs text-muted-foreground">
                      {result}
                    </span>
                  )}
                  {can.update && admin && (
                    <ItemPalletBulkDialog
                      ids={ids}
                      pallets={admin.pallets}
                      defaultPalletType={admin.defaultPalletType}
                      action={admin.palletBulkAction}
                      trigger={
                        <Button type="button" disabled={ids.length === 0}>
                          <LayersIcon />
                          팔레트 적재 일괄 입력
                          {ids.length > 0 && ` (${ids.length})`}
                        </Button>
                      }
                      onDone={(r) => {
                        reportPallet(r)
                        done()
                      }}
                    />
                  )}
                  {can.update &&
                    (admin
                      ? ITEM_STATUS.values.map((status) => statusButton(ids, done, status))
                      : [bulk(ids, done, 'deactivate'), bulk(ids, done, 'activate')])}
                  {can.delete && bulk(ids, done, 'delete')}
                </>
              )
            : undefined
      }
      emptyTitle="등록된 품목이 없습니다"
    />
  )
}
