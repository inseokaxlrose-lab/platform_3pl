'use client'

import { PlayIcon, PowerIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { ListFetcher } from '@/components/master-list/use-list-query'

export type ItemRow = Row

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  spec: string | null
  barcode: string | null
  shipper: string
  baseUnit: string
  units: string | null
  useLot: boolean
  useExpiry: boolean
  labelUnit: string
  labelUnitMissing: boolean
  expiryAlertDays: number | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// 칸 정의 (basePath: 수정 화면 주소 앞부분, withShipper: 화주사 칸을 보일지 — 화주 포털은 자기 화주사뿐이라 숨김)
const columnsOf = (basePath: string, withShipper: boolean): DataGridColumn<Row>[] => [
  {
    id: 'code',
    header: '품목코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `${basePath}/${row.id}`,
  },
  { id: 'name', header: '품목명', accessor: 'name', sortable: true, pinned: true },
  ...(withShipper
    ? [
        {
          id: 'shipper',
          header: '화주사',
          accessor: 'shipper',
          sortable: true,
        } satisfies DataGridColumn<Row>,
      ]
    : []),
  { id: 'spec', header: '규격', accessor: 'spec' },
  { id: 'barcode', header: '바코드', accessor: 'barcode', defaultHidden: true },
  { id: 'systemCode', header: '시스템 코드', accessor: 'systemCode', defaultHidden: true },
  { id: 'baseUnit', header: '기본단위', accessor: 'baseUnit' },
  { id: 'units', header: '환산단위', accessor: 'units' },
  // 로트·유통기한·라벨은 실제로 적용되는 값 (품목이 비어 있으면 화주사 기본값)
  { id: 'useLot', header: '로트', accessor: 'useLot', format: 'yn' },
  { id: 'useExpiry', header: '유통기한', accessor: 'useExpiry', format: 'yn' },
  {
    id: 'labelUnit',
    header: '라벨',
    accessor: 'labelUnit',
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

type Ids = { ids: string[] }

// 품목 목록 (docs/decisions/0041): 행을 누르면 수정 화면 — 운영사 화면·화주 포털 공용 (서버 액션은 각자 넘긴다)
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
  setActiveAction: (input: Ids & { isActive: boolean }) => Promise<ActionResult<unknown>>
  deleteAction: (input: Ids) => Promise<ActionResult<unknown>>
  restoreAction: (input: Ids) => Promise<ActionResult<{ count: number }>>
}) {
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
        { value: 'ACTIVE', label: '사용' },
        { value: 'INACTIVE', label: '사용 중지' },
        // 지운 품목 보기 → [되살리기]
        DELETED_STATUS_OPTION,
      ],
    },
    { key: 'lot', label: '로트 사용', type: 'yn', detail: true },
    { key: 'expiry', label: '유통기한 사용', type: 'yn', detail: true },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({ gridId, fields: searchFields, fetch: listAction })

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

  return (
    <MasterListPage
      title="품목"
      description="화주사가 맡긴 상품입니다. 단위·환산단위와 로트·유통기한 관리 여부를 정합니다."
      actions={actions}
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
                  {can.update && bulk(ids, done, 'deactivate')}
                  {can.update && bulk(ids, done, 'activate')}
                  {can.delete && bulk(ids, done, 'delete')}
                </>
              )
            : undefined
      }
      emptyTitle="등록된 품목이 없습니다"
    />
  )
}
