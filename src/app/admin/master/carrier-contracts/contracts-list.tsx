'use client'

import { PlayIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { ACTIVE_STATUS, ConfirmDialog, StatusBadge } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { CenterSelect } from '@/components/inputs'
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
import {
  deleteContractsAction,
  listContractsAction,
  restoreContractsAction,
  setContractsActiveAction,
} from './actions'
import { CONTRACT_LIST_HREF } from './contract-form'
import type { ContractOptions } from './queries'

type Row = {
  id: string
  carrierName: string
  centerName: string
  shipperName: string | null
  custNo: string
  pickupBranch: string | null
  invoiceRange: string | null
  invoiceNext: string | null
  remaining: string | null
  isDefault: boolean
  validFrom: Date | null
  validTo: Date | null
  status: string
  updatedAt: Date
}

const COLUMNS: DataGridColumn<Row>[] = [
  { id: 'centerName', header: '센터', accessor: 'centerName', hideable: false, pinned: true },
  {
    id: 'shipperName',
    header: '화주사',
    accessor: (row) => row.shipperName ?? '센터 공용',
    hideable: false,
  },
  { id: 'carrierName', header: '운송사', accessor: 'carrierName', hideable: false },
  {
    id: 'custNo',
    header: '고객코드',
    accessor: 'custNo',
    sortable: true,
    href: (row) => `${CONTRACT_LIST_HREF}/${row.id}`,
  },
  {
    id: 'isDefault',
    header: '기본',
    accessor: 'isDefault',
    cell: (row) => (row.isDefault ? <StatusBadge tone="success">기본</StatusBadge> : ''),
  },
  { id: 'pickupBranch', header: '집하 점소', accessor: 'pickupBranch' },
  { id: 'invoiceRange', header: '송장 대역(본번호)', accessor: 'invoiceRange', width: 240 },
  { id: 'invoiceNext', header: '다음 번호', accessor: 'invoiceNext', defaultHidden: true },
  { id: 'remaining', header: '남은 송장', accessor: 'remaining', format: 'number' },
  { id: 'validFrom', header: '시작일', accessor: 'validFrom', format: 'date', defaultHidden: true },
  { id: 'validTo', header: '종료일', accessor: 'validTo', format: 'date', sortable: true },
  {
    id: 'status',
    header: '상태',
    accessor: (row) => String(row.status === 'ACTIVE'),
    sortable: true,
    format: { status: ACTIVE_STATUS },
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

// 운송 계약 목록 (docs/decisions/0094): 센터(·화주)별 택배사 고객코드·송장 대역
export function ContractsList({
  options,
  can,
}: {
  options: ContractOptions
  can: { create: boolean; update: boolean; delete: boolean; export: boolean }
}) {
  // 화주 고르기: 보이는 센터들을 이용하는 화주사 (겹치면 하나만)
  const shippers = [
    ...new Map(options.centers.flatMap((c) => c.shippers).map((s) => [s.id, s])).values(),
  ]
  const fields: SearchFieldDef[] = [
    {
      key: 'center',
      label: '센터',
      type: 'custom',
      render: ({ id, value, onChange }) => (
        <CenterSelect
          id={id}
          options={options.centers}
          value={value}
          onChange={onChange}
          allowAll
        />
      ),
    },
    {
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: [
        { value: 'COMMON', label: '센터 공용' },
        ...shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
      ],
    },
    {
      key: 'carrier',
      label: '운송사',
      type: 'select',
      options: options.carriers.map((c) => ({ value: c.id, label: c.name })),
    },
    { key: 'keyword', label: '검색어', type: 'keyword', placeholder: '고객코드·집하 점소' },
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      options: [
        { value: 'ACTIVE', label: '사용' },
        { value: 'INACTIVE', label: '사용 중지' },
        DELETED_STATUS_OPTION,
      ],
    },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-carrier-contracts',
    fields,
    fetch: listContractsAction,
  })

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
        title={`운송 계약 ${ids.length}건을 ${label}할까요?`}
        description={
          {
            deactivate: '사용 중지한 계약은 출고 송장에서 쓰지 않습니다.',
            activate: '이 계약들을 다시 출고 송장에 씁니다.',
            delete:
              '지운 계약은 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다. 기본 계약 표시는 풀립니다.',
          }[kind]
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteContractsAction({ ids }))
          else unwrap(await setContractsActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  const deletedView = isDeletedView(list.values)
  return (
    <MasterListPage
      title="운송 계약"
      description="센터·화주사별 택배사 계약입니다. 출고 때 화주×센터 계약 → 센터 공용 계약 → 화주사 기본 택배사 순서로 찾습니다."
      actions={
        can.create && (
          <Button asChild>
            <Link href={`${CONTRACT_LIST_HREF}/new`}>
              <PlusIcon />
              운송 계약 등록
            </Link>
          </Button>
        )
      }
      gridId="master-carrier-contracts"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={deletedView ? undefined : (row) => `${CONTRACT_LIST_HREF}/${row.id}`}
      bulkActions={
        deletedView
          ? can.delete
            ? ({ ids, done }) => (
                <RestoreButton
                  ids={ids}
                  noun="운송 계약"
                  restore={(restoreIds) => restoreContractsAction({ ids: restoreIds })}
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
      excelName={can.export ? '운송계약' : undefined}
      emptyTitle="등록된 운송 계약이 없습니다"
    />
  )
}
