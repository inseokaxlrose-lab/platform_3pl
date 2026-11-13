'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  createDataGridState,
  DataGrid,
  type DataGridColumn,
  type DataGridState,
} from '@/components/data-grid'
import { listUsersAction } from './actions'
import { ACTIVE_STATUS, USER_TYPE_STATUS, type UserTypeKey } from './labels'

type Row = {
  id: string
  username: string
  name: string
  userType: UserTypeKey
  isActive: boolean
  createdAt: Date
  affiliation: string | null
  groups: string | null
}

const columns: DataGridColumn<Row>[] = [
  {
    id: 'username',
    header: '아이디',
    accessor: 'username',
    sortable: true,
    hideable: false,
    cell: (row) => (
      <Link
        href={`/admin/system/users/${row.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.username}
      </Link>
    ),
  },
  { id: 'name', header: '이름', accessor: 'name', sortable: true },
  {
    id: 'userType',
    header: '유형',
    accessor: 'userType',
    sortable: true,
    format: { status: USER_TYPE_STATUS },
  },
  { id: 'affiliation', header: '소속', accessor: 'affiliation' },
  { id: 'groups', header: '권한그룹', accessor: 'groups' },
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

// 사용자 목록: 상태가 바뀌면 서버 액션으로 다시 조회한다
export function UsersGrid() {
  const [state, setState] = useState<DataGridState>(() => createDataGridState())
  const [result, setResult] = useState<{ rows: Row[]; rowCount: number }>({ rows: [], rowCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listUsersAction(state).then((response) => {
      if (cancelled) return
      if (response.ok) {
        setResult(response.data)
        setError(null)
      } else {
        setError(response.error.message)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [state])

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <DataGrid
        id="system-users"
        columns={columns}
        data={result.rows}
        rowCount={result.rowCount}
        state={state}
        onStateChange={(next) => {
          setState(next)
          setLoading(true)
        }}
        loading={loading}
        getRowId={(row) => row.id}
        searchPlaceholder="아이디·이름·이메일 검색"
        empty={{ title: '등록된 사용자가 없습니다' }}
      />
    </>
  )
}
