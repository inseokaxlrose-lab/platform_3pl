'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ACTIVE_STATUS } from '@/components/common'
import { DataGrid, type DataGridColumn, useDataGridState } from '@/components/data-grid'
import { listCentersAction } from './actions'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  phone: string | null
  address: string | null
  isActive: boolean
  updatedAt: Date
  warehouseCount: number
}

const columns: DataGridColumn<Row>[] = [
  {
    id: 'code',
    header: '센터 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    // 사용자 코드를 크게, 시스템 코드를 작게 함께 (0025)
    cell: (row) => (
      <Link href={`/admin/master/centers/${row.id}`} className="group block">
        <span className="font-medium text-primary group-hover:underline">{row.code}</span>
        {row.code !== row.systemCode && (
          <span className="ml-1.5 text-xs text-muted-foreground">{row.systemCode}</span>
        )}
      </Link>
    ),
  },
  { id: 'name', header: '센터명', accessor: 'name', sortable: true },
  { id: 'address', header: '주소', accessor: 'address' },
  { id: 'phone', header: '대표 전화', accessor: 'phone' },
  { id: 'warehouseCount', header: '창고 수', accessor: 'warehouseCount', format: 'number' },
  {
    id: 'isActive',
    header: '상태',
    accessor: (row) => String(row.isActive),
    sortable: true,
    format: { status: ACTIVE_STATUS },
  },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
  },
]

// 센터 목록 (데이터 범위: 센터 직원은 소속 센터만, 서버에서 거른다)
export function CentersGrid() {
  const [state, setState] = useDataGridState('master-centers')
  const [result, setResult] = useState<{ rows: Row[]; rowCount: number }>({ rows: [], rowCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listCentersAction(state).then((response) => {
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
        id="master-centers"
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
        searchPlaceholder="센터 코드·시스템 코드·센터명·주소 검색"
        empty={{ title: '등록된 센터가 없습니다' }}
      />
    </>
  )
}
