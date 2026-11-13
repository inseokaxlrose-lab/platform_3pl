'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ACTIVE_STATUS } from '@/components/common'
import { DataGrid, type DataGridColumn, useDataGridState } from '@/components/data-grid'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STORAGE_CONDITION_STATUS, WAREHOUSE_TYPE_STATUS } from '@/lib/warehouses/warehouse-labels'
import { listWarehousesAction } from './actions'
import type { CenterOption } from './queries'

type Row = {
  id: string
  systemCode: string
  code: string
  name: string
  type: string
  storageCondition: string
  isActive: boolean
  updatedAt: Date
  center: string
  locationCount: number
}

const ALL_CENTERS = 'all'

const columns: DataGridColumn<Row>[] = [
  { id: 'center', header: '센터', accessor: 'center', sortable: true },
  {
    id: 'code',
    header: '창고 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    // 사용자 코드를 크게, 시스템 코드를 작게 함께 (0025)
    cell: (row) => (
      <Link href={`/admin/master/warehouses/${row.id}`} className="group block">
        <span className="font-medium text-primary group-hover:underline">{row.code}</span>
        {row.code !== row.systemCode && (
          <span className="ml-1.5 text-xs text-muted-foreground">{row.systemCode}</span>
        )}
      </Link>
    ),
  },
  { id: 'name', header: '창고명', accessor: 'name', sortable: true },
  {
    id: 'type',
    header: '유형',
    accessor: 'type',
    sortable: true,
    format: { status: WAREHOUSE_TYPE_STATUS },
  },
  {
    id: 'storageCondition',
    header: '보관 조건',
    accessor: 'storageCondition',
    sortable: true,
    format: { status: STORAGE_CONDITION_STATUS },
  },
  { id: 'locationCount', header: '로케이션 수', accessor: 'locationCount', format: 'number' },
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

// 창고 목록: 위쪽에서 센터를 고르면 그 센터의 창고만 (데이터 범위는 서버에서 거른다)
export function WarehousesGrid({ centers }: { centers: CenterOption[] }) {
  const [state, setState] = useDataGridState('master-warehouses')
  const [centerId, setCenterId] = useState(ALL_CENTERS)
  const [result, setResult] = useState<{ rows: Row[]; rowCount: number }>({ rows: [], rowCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listWarehousesAction({
      ...state,
      centerId: centerId === ALL_CENTERS ? undefined : centerId,
    }).then((response) => {
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
  }, [state, centerId])

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <DataGrid
        id="master-warehouses"
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
        searchPlaceholder="창고 코드·창고명·센터 검색"
        empty={{ title: '등록된 창고가 없습니다' }}
        toolbarActions={
          <Select
            value={centerId}
            onValueChange={(next) => {
              setCenterId(next)
              setState({ ...state, pageIndex: 0 })
              setLoading(true)
            }}
          >
            <SelectTrigger aria-label="센터 고르기" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CENTERS}>모든 센터</SelectItem>
              {centers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </>
  )
}
