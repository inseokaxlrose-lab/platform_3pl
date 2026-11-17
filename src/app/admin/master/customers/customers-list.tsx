'use client'

import { PlayIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import { ConfirmDialog } from '@/components/common'
import { ExcelUploadDialog } from '@/components/excel-upload'
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
  CUSTOMER_STATUS,
  CUSTOMER_STATUS_BADGE,
  DATA_SOURCE,
  ORDER_ADDR_MODE,
  PARTNER_TYPE_GROUP,
} from '@/lib/customers/customer-codes'
import { customerUploadTemplate } from '@/lib/customers/customer-upload-template'
import {
  deleteCustomersAction,
  listCustomersAction,
  commitCustomerUploadAction,
  restoreCustomersAction,
  setCustomersStatusAction,
  validateCustomerUploadAction,
} from './actions'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  customerType: string | null
  customerGroup: string | null
  businessNumber: string | null
  phone: string | null
  status: string
  source: string
  lastIfAt: Date | null
  shipper: string
  defaultShipTo: string | null
  deliveryCenter: string | null
  shipToCount: number
  needConfirmCount: number
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
    id: 'customerType',
    header: '유형',
    accessor: 'customerType',
    format: { code: PARTNER_TYPE_GROUP },
    sortable: true,
  },
  {
    id: 'customerGroup',
    header: '그룹',
    accessor: 'customerGroup',
    sortable: true,
    defaultHidden: true,
  },
  {
    id: 'businessNumber',
    header: '사업자등록번호',
    accessor: 'businessNumber',
    format: 'bizNo',
    defaultHidden: true,
  },
  { id: 'phone', header: '대표 전화', accessor: 'phone', format: 'phone', defaultHidden: true },
  // 기본 납품처의 시군구와 배송센터 (0082)
  { id: 'defaultShipTo', header: '기본 납품처 지역', accessor: 'defaultShipTo' },
  { id: 'deliveryCenter', header: '배송센터', accessor: 'deliveryCenter' },
  {
    id: 'shipToCount',
    header: '납품처 수',
    accessor: 'shipToCount',
    format: 'number',
  },
  // 배송센터 확인이 필요한 납품처 수 (있으면 경고색)
  {
    id: 'needConfirmCount',
    header: '확인 필요',
    accessor: 'needConfirmCount',
    cell: (row) =>
      row.needConfirmCount > 0 ? (
        <span className="font-medium text-warning">{row.needConfirmCount}</span>
      ) : (
        '-'
      ),
  },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    sortable: true,
    format: { status: CUSTOMER_STATUS_BADGE },
  },
  {
    id: 'source',
    header: '등록 경로',
    accessor: (row) =>
      DATA_SOURCE.labels[row.source as keyof typeof DATA_SOURCE.labels] ?? row.source,
    sortable: true,
    defaultHidden: true,
  },
  {
    id: 'lastIfAt',
    header: '마지막 연동',
    accessor: 'lastIfAt',
    format: 'datetime',
    sortable: true,
    defaultHidden: true,
  },
  { id: 'systemCode', header: '시스템 코드', accessor: 'systemCode', defaultHidden: true },
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
  can: { update: boolean; delete: boolean; export: boolean; upload: boolean }
  actions?: React.ReactNode
}) {
  const searchFields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '거래처코드·명·약칭·사업자번호·화주사',
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
        ...CUSTOMER_STATUS.options,
        // 지운 거래처 보기 → [되살리기]
        DELETED_STATUS_OPTION,
      ],
    },
    {
      key: 'needConfirm',
      label: '배송센터 확인 필요',
      type: 'yn',
      ynLabels: ['있음', '없음'],
    },
    {
      key: 'customerType',
      label: '거래처 유형',
      type: 'codeMulti',
      codeGroup: PARTNER_TYPE_GROUP,
      detail: true,
    },
    { key: 'customerGroup', label: '거래처 그룹', type: 'text', detail: true },
    {
      key: 'orderAddrMode',
      label: '주문 주소 사용',
      type: 'multi',
      options: ORDER_ADDR_MODE.options,
      detail: true,
    },
    {
      key: 'source',
      label: '등록 경로',
      type: 'multi',
      options: DATA_SOURCE.options,
      detail: true,
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-customers',
    fields: searchFields,
    fetch: listCustomersAction,
  })

  const bulk = (ids: string[], done: () => void, kind: 'deactivate' | 'activate' | 'delete') => {
    const label = { deactivate: '거래중지', activate: '거래재개', delete: '삭제' }[kind]
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
              ? '새 출고요청을 받지 않습니다. 진행 중인 주문은 그대로 처리합니다.'
              : undefined
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteCustomersAction({ ids }))
          else
            unwrap(
              await setCustomersStatusAction({
                ids,
                status: kind === 'activate' ? 'ACTIVE' : 'SUSPENDED',
              }),
            )
          done()
        }}
      />
    )
  }

  return (
    <MasterListPage
      title="거래처"
      description="화주사의 고객사입니다. 거래처마다 물건을 받는 납품처를 두고, 납품처 주소로 권역설정의 배송센터를 정합니다."
      actions={
        <>
          {can.upload && (
            <ExcelUploadDialog
              template={customerUploadTemplate}
              title="거래처 엑셀 업로드"
              description="한 줄이 납품처 하나입니다. 이미 있는 거래처는 넣은 칸만 고칩니다. 오류가 하나라도 있으면 파일 전체가 등록되지 않습니다."
              validate={validateCustomerUploadAction}
              commit={commitCustomerUploadAction}
              onDone={list.refresh}
            />
          )}
          {actions}
        </>
      }
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
