'use client'

import { PlayIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
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
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { EMPTY_CUSTOMER_ITEM } from '@/lib/customer-items/customer-item-schema'
import { customerItemUploadTemplate } from '@/lib/customer-items/customer-item-upload-template'
import {
  commitCustomerItemUploadAction,
  deleteCustomerItemsAction,
  listCustomerItemsAction,
  restoreCustomerItemsAction,
  setCustomerItemsActiveAction,
  validateCustomerItemUploadAction,
} from './actions'
import {
  CustomerItemDialog,
  type CustomerItemDialogTarget,
  type ShipperChoice,
} from './customer-item-dialog'

type Row = {
  id: string
  shipperId: string
  shipperName: string
  customerId: string
  customer: string
  itemId: string
  itemCode: string
  itemName: string
  custItemCode: string
  custItemName: string | null
  custBarcode: string | null
  deliveryUnitId: string | null
  deliveryUnit: string | null
  minShelfDays: number | null
  minShelfRatio: string | null
  remark: string | null
  status: string
  rowVersion: number
  updatedAt: Date
  updatedBy: string
}

const COLUMNS: DataGridColumn<Row>[] = [
  { id: 'shipperName', header: '화주사', accessor: 'shipperName' },
  {
    id: 'customer',
    header: '거래처',
    accessor: 'customer',
    sortable: true,
    hideable: false,
    pinned: true,
  },
  { id: 'itemCode', header: '품목코드', accessor: 'itemCode', sortable: true, hideable: false },
  { id: 'itemName', header: '품목명', accessor: 'itemName' },
  {
    id: 'custItemCode',
    header: '거래처 품목코드',
    accessor: 'custItemCode',
    sortable: true,
    hideable: false,
  },
  { id: 'custItemName', header: '거래처 품목명', accessor: 'custItemName' },
  { id: 'custBarcode', header: '거래처 바코드', accessor: 'custBarcode' },
  {
    id: 'deliveryUnit',
    header: '납품 단위',
    accessor: (row) => row.deliveryUnit ?? '기본',
  },
  {
    id: 'minShelf',
    header: '최소 잔여',
    accessor: (row) =>
      [
        row.minShelfDays !== null && `${row.minShelfDays}일`,
        row.minShelfRatio !== null && `${row.minShelfRatio}%`,
      ]
        .filter(Boolean)
        .join(' · ') || '거래처 값',
  },
  { id: 'remark', header: '비고', accessor: 'remark', defaultHidden: true },
  {
    id: 'status',
    header: '상태',
    accessor: (row) => String(row.status === 'ACTIVE'),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  { id: 'updatedBy', header: '수정자', accessor: 'updatedBy', defaultHidden: true },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
    defaultHidden: true,
  },
]

// 거래처별 품목코드 (docs/decisions/0098): 거래처(매출처)마다 다른 상품코드·바코드·납품 단위
export function CustomerItemsList({
  shippers,
  can,
}: {
  shippers: ShipperChoice[]
  can: { create: boolean; update: boolean; delete: boolean; export: boolean }
}) {
  const fields: SearchFieldDef[] = [
    {
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      placeholder: '거래처 품목코드·바코드, 품목, 거래처',
    },
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
    gridId: 'master-customer-items',
    fields,
    fetch: listCustomerItemsAction,
  })
  const [dialog, setDialog] = useState<CustomerItemDialogTarget | null>(null)
  const deletedView = isDeletedView(list.values)

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
        title={`거래처 품목코드 ${ids.length}건을 ${label}할까요?`}
        description={
          {
            deactivate: '사용 중지한 코드는 납품서·라벨에 쓰지 않습니다.',
            activate: '이 코드들을 다시 납품서·라벨에 씁니다.',
            delete: '지운 코드는 상태 거르기의 "삭제됨"에서 되살릴 수 있습니다.',
          }[kind]
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteCustomerItemsAction({ ids }))
          else unwrap(await setCustomerItemsActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  return (
    <>
      <MasterListPage
        title="거래처별 품목코드"
        description="같은 품목도 납품하는 거래처(대형마트·유통사)마다 상품코드·바코드가 다릅니다. 거래처 × 품목마다 거래처의 코드를 등록하면 납품서·라벨에 찍습니다."
        actions={
          <>
            {can.create && can.update && (
              <ExcelUploadDialog
                template={customerItemUploadTemplate}
                title="거래처별 품목코드 엑셀 업로드"
                description="한 줄이 거래처 × 품목 하나입니다. 이미 있으면 넣은 칸만 고칩니다. 오류가 하나라도 있으면 파일 전체가 등록되지 않습니다."
                validate={validateCustomerItemUploadAction}
                commit={commitCustomerItemUploadAction}
                onDone={list.refresh}
              />
            )}
            {can.create && (
              <Button
                type="button"
                onClick={() =>
                  setDialog({
                    mode: 'create',
                    // 화주사가 하나면 미리 고른다
                    shipperId: shippers.length === 1 ? shippers[0].id : '',
                    initial: EMPTY_CUSTOMER_ITEM,
                  })
                }
              >
                <PlusIcon />
                거래처 품목코드 등록
              </Button>
            )}
          </>
        }
        gridId="master-customer-items"
        searchFields={fields}
        list={list}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        onRowClick={
          deletedView || !can.update
            ? undefined
            : (row) =>
                setDialog({
                  mode: 'edit',
                  id: row.id,
                  rowVersion: row.rowVersion,
                  shipperId: row.shipperId,
                  initial: {
                    customerId: row.customerId,
                    itemId: row.itemId,
                    custItemCode: row.custItemCode,
                    custItemName: row.custItemName ?? '',
                    custBarcode: row.custBarcode ?? '',
                    deliveryUnitId: row.deliveryUnitId ?? '',
                    minShelfDays: row.minShelfDays,
                    minShelfRatio: row.minShelfRatio ?? '',
                    isActive: row.status === 'ACTIVE',
                    remark: row.remark ?? '',
                  },
                })
        }
        bulkActions={
          deletedView
            ? can.delete
              ? ({ ids, done }) => (
                  <RestoreButton
                    ids={ids}
                    noun="거래처 품목코드"
                    restore={(restoreIds) => restoreCustomerItemsAction({ ids: restoreIds })}
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
        excelName={can.export ? '거래처별품목코드' : undefined}
        emptyTitle="등록된 거래처 품목코드가 없습니다"
      />
      <CustomerItemDialog
        target={dialog}
        shippers={shippers}
        onClose={() => setDialog(null)}
        onDone={list.refresh}
        canDelete={can.delete}
      />
    </>
  )
}
