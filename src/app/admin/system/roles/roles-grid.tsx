'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DataGrid, type DataGridColumn, useDataGridState } from '@/components/data-grid'
import { listPermissionGroupsAction } from './actions'
import { AREA_STATUS } from './area-labels'

type Row = {
  id: string
  name: string
  area: 'ADMIN' | 'PORTAL'
  description: string | null
  permissionCount: number
  userCount: number
  updatedAt: Date
}

const columns: DataGridColumn<Row>[] = [
  {
    id: 'name',
    header: '이름',
    accessor: 'name',
    sortable: true,
    hideable: false,
    // 이름을 누르면 수정 화면으로
    cell: (row) => (
      <Link
        href={`/admin/system/roles/${row.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.name}
      </Link>
    ),
  },
  { id: 'area', header: '영역', accessor: 'area', sortable: true, format: { status: AREA_STATUS } },
  { id: 'description', header: '설명', accessor: 'description' },
  { id: 'permissionCount', header: '권한 수', accessor: 'permissionCount', format: 'number' },
  { id: 'userCount', header: '사용자 수', accessor: 'userCount', format: 'number' },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
  },
]

// 권한그룹 목록: 상태가 바뀌면 서버 액션으로 다시 조회한다
export function RolesGrid() {
  // 저장된 개인 설정(건수·정렬)으로 시작 — DataGrid id와 같은 이름
  const [state, setState] = useDataGridState('system-roles')
  const [result, setResult] = useState<{ rows: Row[]; rowCount: number }>({ rows: [], rowCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPermissionGroupsAction(state).then((response) => {
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
        id="system-roles"
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
        searchPlaceholder="이름·설명 검색"
        empty={{ title: '등록된 권한그룹이 없습니다' }}
      />
    </>
  )
}
