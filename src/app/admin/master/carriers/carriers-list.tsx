'use client'

import { PlayIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
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
import { CARRIER_TYPE, INVOICE_CHECK_RULE } from '@/lib/carriers/carrier-codes'
import { labelOf } from '@/lib/db-value'
import {
  deleteCarriersAction,
  listCarriersAction,
  restoreCarriersAction,
  setCarriersActiveAction,
} from './actions'
import { CARRIER_LIST_HREF } from './carrier-form'

type Row = {
  id: string
  code: string
  custCode: string | null
  name: string
  carrierType: string
  invoiceDigits: number | null
  invoiceCheck: string
  trackingUrl: string | null
  tel: string | null
  status: string
  sortOrder: number
  contractCount: number
  updatedAt: Date
}

const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: 'keyword',
    label: '검색어',
    type: 'keyword',
    span: 4,
    placeholder: '코드·사용자 정의 코드·운송사명',
  },
  { key: 'type', label: '운송 유형', type: 'multi', options: CARRIER_TYPE.options },
  {
    key: 'status',
    label: '상태',
    type: 'segment',
    options: [
      { value: 'ACTIVE', label: '사용' },
      { value: 'INACTIVE', label: '사용 중지' },
      // 지운 운송사 보기 → [되살리기]
      DELETED_STATUS_OPTION,
    ],
  },
]

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `${CARRIER_LIST_HREF}/${row.id}`,
  },
  { id: 'name', header: '운송사명', accessor: 'name', sortable: true, hideable: false },
  {
    id: 'carrierType',
    header: '운송 유형',
    accessor: (row) => labelOf(CARRIER_TYPE.labels, row.carrierType),
    sortable: true,
  },
  {
    id: 'invoice',
    header: '송장 규칙',
    accessor: (row) =>
      row.invoiceDigits === null
        ? '-'
        : `${row.invoiceDigits}자리 · ${labelOf(INVOICE_CHECK_RULE.labels, row.invoiceCheck)}`,
  },
  { id: 'contractCount', header: '운송 계약', accessor: 'contractCount', format: 'number' },
  { id: 'custCode', header: '사용자 정의 코드', accessor: 'custCode' },
  { id: 'tel', header: '대표 전화', accessor: 'tel', format: 'phone', defaultHidden: true },
  {
    id: 'status',
    header: '상태',
    accessor: (row) => String(row.status === 'ACTIVE'),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  {
    id: 'sortOrder',
    header: '정렬순서',
    accessor: 'sortOrder',
    sortable: true,
    defaultHidden: true,
  },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
    defaultHidden: true,
  },
]

// 운송사 목록 (docs/decisions/0094): 택배사·화물·자차·용차. 운영사마다 기본 7곳이 들어 있다
export function CarriersList({
  can,
}: {
  can: { create: boolean; update: boolean; delete: boolean }
}) {
  const list = useListQuery<Row>({
    gridId: 'master-carriers',
    fields: SEARCH_FIELDS,
    fetch: listCarriersAction,
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
        title={`운송사 ${ids.length}곳을 ${label}할까요?`}
        description={
          {
            deactivate:
              '사용 중지한 운송사는 새 운송 계약·화주사 기본 택배사에서 고를 수 없습니다.',
            activate: '이 운송사들을 다시 고를 수 있게 됩니다.',
            delete:
              '운송 계약이나 화주사 기본 택배사에 쓰인 운송사는 삭제되지 않습니다. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.',
          }[kind]
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteCarriersAction({ ids }))
          else unwrap(await setCarriersActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  const deletedView = isDeletedView(list.values)
  return (
    <MasterListPage
      title="운송사"
      description="출고 송장을 뽑는 택배사와 화물·자차·용차입니다. 화주·센터별 고객코드와 송장 대역은 운송 계약에서 정합니다."
      actions={
        can.create && (
          <Button asChild>
            <Link href={`${CARRIER_LIST_HREF}/new`}>
              <PlusIcon />
              운송사 등록
            </Link>
          </Button>
        )
      }
      gridId="master-carriers"
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={deletedView ? undefined : (row) => `${CARRIER_LIST_HREF}/${row.id}`}
      bulkActions={
        deletedView
          ? can.delete
            ? ({ ids, done }) => (
                <RestoreButton
                  ids={ids}
                  noun="운송사"
                  restore={(restoreIds) => restoreCarriersAction({ ids: restoreIds })}
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
      emptyTitle="등록된 운송사가 없습니다"
    />
  )
}
