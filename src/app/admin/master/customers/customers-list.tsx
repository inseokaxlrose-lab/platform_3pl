'use client'

import { PlayIcon, PowerIcon, Trash2Icon } from 'lucide-react'
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
import {
  deleteCustomersAction,
  listCustomersAction,
  restoreCustomersAction,
  setCustomersActiveAction,
} from './actions'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  businessNumber: string | null
  phone: string | null
  zipCode: string | null
  address: string | null
  receiverName: string | null
  receiverPhone: string | null
  shipper: string
  zones: string | null
  deliveryCenter: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '거래처코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/master/customers/${row.id}`,
  },
  { id: 'name', header: '거래처명', accessor: 'name', sortable: true, pinned: true },
  { id: 'shipper', header: '화주사', accessor: 'shipper', sortable: true },
  {
    id: 'businessNumber',
    header: '사업자등록번호',
    accessor: 'businessNumber',
    format: 'bizNo',
    defaultHidden: true,
  },
  { id: 'phone', header: '대표 전화', accessor: 'phone', format: 'phone' },
  { id: 'address', header: '배송지', accessor: 'address' },
  { id: 'receiverName', header: '받는 사람', accessor: 'receiverName' },
  {
    id: 'receiverPhone',
    header: '받는 사람 연락처',
    accessor: 'receiverPhone',
    format: 'phone',
    defaultHidden: true,
  },
  // 배송지가 드는 배송권역 (화주사가 이용하는 센터별, 0043)
  { id: 'zones', header: '배송권역', accessor: 'zones' },
  // 출고 때 배송할 센터 (0072): 거래처 지정 → 더 구체적인 지역 → 우선순위, 못 정하면 배정 대기
  {
    id: 'deliveryCenter',
    header: '배송 센터',
    accessor: 'deliveryCenter',
    cell: (row) =>
      row.deliveryCenter?.startsWith('배정 대기') ? (
        <span className="font-medium text-destructive">{row.deliveryCenter}</span>
      ) : (
        (row.deliveryCenter ?? '-')
      ),
  },
  { id: 'systemCode', header: '시스템 코드', accessor: 'systemCode', defaultHidden: true },
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

// 거래처 목록 (docs/decisions/0043): 행을 누르면 수정 화면
export function CustomersList({
  shippers,
  can,
  actions,
}: {
  shippers: { id: string; code: string; name: string }[]
  can: { update: boolean; delete: boolean; export: boolean }
  actions?: React.ReactNode
}) {
  const searchFields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '거래처코드·명·사업자번호·주소·받는 사람·화주사',
    },
    {
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      options: [
        { value: 'ACTIVE', label: '사용' },
        { value: 'INACTIVE', label: '사용 중지' },
        // 지운 거래처 보기 → [되살리기]
        DELETED_STATUS_OPTION,
      ],
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-customers',
    fields: searchFields,
    fetch: listCustomersAction,
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
        title={`거래처 ${ids.length}곳을 ${label}할까요?`}
        description={
          kind === 'delete'
            ? '출고 기록이 없는 거래처만 지워집니다. 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.'
            : kind === 'deactivate'
              ? '새 출고에서 고를 수 없게 됩니다. 기록은 남습니다.'
              : undefined
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteCustomersAction({ ids }))
          else unwrap(await setCustomersActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  return (
    <MasterListPage
      title="거래처"
      description="화주사의 고객사입니다. 출고할 때 물건을 받는 곳이며, 배송지 주소로 배송권역을 맞춰 봅니다."
      actions={actions}
      gridId="master-customers"
      searchFields={searchFields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={
        isDeletedView(list.values) ? undefined : (row) => `/admin/master/customers/${row.id}`
      }
      excelName={can.export ? '거래처' : undefined}
      bulkActions={
        isDeletedView(list.values)
          ? can.delete
            ? ({ ids, done }) => (
                <RestoreButton
                  ids={ids}
                  noun="거래처"
                  restore={(restoreIds) => restoreCustomersAction({ ids: restoreIds })}
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
      emptyTitle="등록된 거래처가 없습니다"
    />
  )
}
