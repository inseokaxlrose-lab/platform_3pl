'use client'

import { PlayIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
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
  deleteRoutesAction,
  listRoutesAction,
  restoreRoutesAction,
  setRoutesActiveAction,
} from './actions'
import type { RouteOptions } from './queries'
import { ROUTE_LIST_HREF } from './route-form'

type Row = {
  id: string
  code: string
  custCode: string | null
  name: string
  centerName: string
  carrierName: string | null
  runDays: string
  cutoffTime: string | null
  vehicleTon: string | null
  destHub: string | null
  zipCount: number
  manualShipToCount: number
  status: string
  sortOrder: number
  updatedAt: Date
}

// 'YYYYYNN' → '월화수목금'
const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const daysText = (value: string) =>
  value === 'YYYYYYY'
    ? '매일'
    : value === 'YYYYYNN'
      ? '평일'
      : DAYS.filter((_, i) => value[i] === 'Y').join('')

const COLUMNS: DataGridColumn<Row>[] = [
  { id: 'centerName', header: '센터', accessor: 'centerName', hideable: false, pinned: true },
  {
    id: 'code',
    header: '코스 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `${ROUTE_LIST_HREF}/${row.id}`,
  },
  { id: 'name', header: '코스명', accessor: 'name', sortable: true, hideable: false },
  { id: 'carrierName', header: '운송사', accessor: 'carrierName' },
  { id: 'runDays', header: '운행 요일', accessor: (row) => daysText(row.runDays) },
  { id: 'cutoffTime', header: '출발 마감', accessor: 'cutoffTime' },
  {
    id: 'vehicleTon',
    header: '차량 톤수',
    accessor: 'vehicleTon',
    format: { code: 'VEHICLE_TON' },
  },
  { id: 'zipCount', header: '우편번호', accessor: 'zipCount', format: 'number' },
  {
    id: 'manualShipToCount',
    header: '직접 지정 납품처',
    accessor: 'manualShipToCount',
    format: 'number',
    defaultHidden: true,
  },
  { id: 'destHub', header: '도착 거점', accessor: 'destHub', defaultHidden: true },
  { id: 'custCode', header: '사용자 정의 코드', accessor: 'custCode', defaultHidden: true },
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

// 배송 코스 목록 (docs/decisions/0095): 센터 안에서 어느 차·어느 길로 보내는지 + 우편번호 배정 수
export function RoutesList({
  options,
  can,
}: {
  options: RouteOptions
  can: { create: boolean; update: boolean; delete: boolean; export: boolean }
}) {
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
      key: 'carrier',
      label: '운송사',
      type: 'select',
      options: options.carriers.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      placeholder: '코스 코드·사용자 정의 코드·코스명·도착 거점',
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
  const list = useListQuery<Row>({ gridId: 'master-routes', fields, fetch: listRoutesAction })

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
        title={`배송 코스 ${ids.length}개를 ${label}할까요?`}
        description={
          {
            deactivate:
              '사용 중지한 코스는 납품처의 코스로 쓰이지 않습니다 (우편번호 배정은 남습니다).',
            activate: '이 코스들을 다시 납품처의 코스로 씁니다.',
            delete:
              '납품처가 직접 지정한 코스는 삭제되지 않습니다. 우편번호 배정은 함께 지워지고, 되살려도 돌아오지 않습니다.',
          }[kind]
        }
        confirmLabel={label}
        destructive={kind !== 'activate'}
        onConfirm={async () => {
          if (kind === 'delete') unwrap(await deleteRoutesAction({ ids }))
          else unwrap(await setRoutesActiveAction({ ids, isActive: kind === 'activate' }))
          done()
        }}
      />
    )
  }

  const deletedView = isDeletedView(list.values)
  return (
    <MasterListPage
      title="배송 코스"
      description="센터 안에서 어느 차·어느 길로 보낼지 정합니다. 우편번호를 코스에 배정하면 납품처의 코스가 저절로 정해집니다."
      actions={
        can.create && (
          <Button asChild>
            <Link href={`${ROUTE_LIST_HREF}/new`}>
              <PlusIcon />
              배송 코스 등록
            </Link>
          </Button>
        )
      }
      gridId="master-routes"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={deletedView ? undefined : (row) => `${ROUTE_LIST_HREF}/${row.id}`}
      bulkActions={
        deletedView
          ? can.delete
            ? ({ ids, done }) => (
                <RestoreButton
                  ids={ids}
                  noun="배송 코스"
                  restore={(restoreIds) => restoreRoutesAction({ ids: restoreIds })}
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
      excelName={can.export ? '배송코스' : undefined}
      emptyTitle="등록된 배송 코스가 없습니다"
    />
  )
}
