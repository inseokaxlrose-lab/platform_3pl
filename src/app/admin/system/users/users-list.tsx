'use client'

import { PlayIcon, PowerIcon } from 'lucide-react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import type { DataGridColumn } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { USER_TYPES } from '@/lib/users/user-schema'
import { listUsersAction, setUsersActiveAction } from './actions'
import { USER_TYPE_LABELS, USER_TYPE_STATUS, type UserTypeKey } from './labels'
import type { UserFormOptions } from './queries'

type Row = {
  id: string
  username: string
  name: string
  email: string | null
  userType: UserTypeKey
  isActive: boolean
  createdAt: Date
  affiliation: string | null
  groups: string | null
}

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'username',
    header: '아이디',
    accessor: 'username',
    sortable: true,
    hideable: false,
    pinned: true,
    href: (row) => `/admin/system/users/${row.id}`,
  },
  { id: 'name', header: '이름', accessor: 'name', sortable: true, hideable: false, pinned: true },
  {
    id: 'userType',
    header: '유형',
    accessor: 'userType',
    sortable: true,
    format: { status: USER_TYPE_STATUS },
  },
  { id: 'affiliation', header: '소속', accessor: 'affiliation' },
  { id: 'groups', header: '권한그룹', accessor: 'groups' },
  { id: 'email', header: '이메일', accessor: 'email', defaultHidden: true },
  {
    id: 'isActive',
    header: '상태',
    accessor: (row) => String(row.isActive),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  {
    id: 'createdAt',
    header: '등록일시',
    accessor: 'createdAt',
    format: 'datetime',
    sortable: true,
  },
]

// 사용자 목록 (운영사 전용: 시스템 메뉴 권한은 운영사에게만 계산된다, 0018)
export function UsersList({
  options,
  actions,
  canBulkUpdate,
  canExport,
}: {
  // 권한그룹·센터·화주사 선택지
  options: UserFormOptions
  actions?: React.ReactNode
  canBulkUpdate: boolean
  canExport: boolean
}) {
  // 검색 조건 (키는 서버 listUsersAction의 filters와 같게)
  const fields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '아이디·이름·이메일',
    },
    {
      key: 'userType',
      label: '유형',
      type: 'segment',
      span: 4,
      options: USER_TYPES.map((value) => ({ value, label: USER_TYPE_LABELS[value] })),
    },
    {
      key: 'status',
      label: '상태',
      type: 'segment',
      options: [
        { value: 'ACTIVE', label: '사용' },
        { value: 'INACTIVE', label: '사용 중지' },
      ],
    },
    {
      key: 'group',
      label: '권한그룹',
      type: 'select',
      detail: true,
      options: options.groups.map((g) => ({
        value: g.id,
        label: `${g.name}${g.area === 'PORTAL' ? ' (포털)' : ''}`,
      })),
    },
    {
      key: 'center',
      label: '소속 센터',
      type: 'select',
      detail: true,
      options: options.centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    {
      key: 'shipper',
      label: '소속 화주사',
      type: 'select',
      detail: true,
      options: options.shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
  ]
  const list = useListQuery<Row>({ gridId: 'system-users', fields, fetch: listUsersAction })

  // 일괄 사용 중지 / 다시 사용 (실행 전 대상 건수 확인)
  const bulkButton = (ids: string[], done: () => void, isActive: boolean) => (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant={isActive ? 'outline' : 'destructive'}
          disabled={ids.length === 0}
        >
          {isActive ? <PlayIcon /> : <PowerIcon />}
          {isActive ? '다시 사용' : '사용 중지'}
          {ids.length > 0 && ` (${ids.length})`}
        </Button>
      }
      title={`사용자 ${ids.length}명을 ${isActive ? '다시 사용' : '사용 중지'}할까요?`}
      description={
        isActive
          ? '다시 로그인할 수 있게 됩니다.'
          : '즉시 로그아웃되고 로그인할 수 없게 됩니다. 기록은 남습니다. 자기 자신은 사용 중지할 수 없습니다.'
      }
      confirmLabel={isActive ? '다시 사용' : '사용 중지'}
      destructive={!isActive}
      onConfirm={async () => {
        unwrap(await setUsersActiveAction({ ids, isActive }))
        done()
      }}
    />
  )

  return (
    <MasterListPage
      title="사용자"
      description="계정을 만들고 소속·권한그룹을 배정합니다. 퇴사자는 삭제하지 않고 사용 중지합니다."
      actions={actions}
      gridId="system-users"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/system/users/${row.id}`}
      bulkActions={
        canBulkUpdate
          ? ({ ids, done }) => (
              <>
                {bulkButton(ids, done, false)}
                {bulkButton(ids, done, true)}
              </>
            )
          : undefined
      }
      excelName={canExport ? '사용자' : undefined}
      emptyTitle="등록된 사용자가 없습니다"
    />
  )
}
