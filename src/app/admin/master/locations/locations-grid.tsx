'use client'

import { LayersIcon, PowerIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ACTIVE_STATUS, ConfirmDialog } from '@/components/common'
import { DataGrid, type DataGridColumn, useDataGridState } from '@/components/data-grid'
import { usePermission } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { deleteLocationsAction, listLocationsAction, setLocationsActiveAction } from './actions'
import { AddLocationDialog } from './add-location-dialog'
import { ALL, LocationFilters, type LocationFilter } from './location-filters'
import type { WarehouseOption } from './queries'

type Row = {
  id: string
  code: string
  zone: string | null
  aisle: string | null
  level: string | null
  isActive: boolean
  createdAt: Date
  center: string
  warehouse: string
  protected: boolean
}

const columns: DataGridColumn<Row>[] = [
  { id: 'center', header: '센터', accessor: 'center', sortable: true },
  { id: 'warehouse', header: '창고', accessor: 'warehouse', sortable: true },
  {
    id: 'code',
    header: '로케이션 코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    cell: (row) => (
      <span className="font-medium">
        {row.code}
        {row.protected && (
          <span className="ml-1.5 text-xs text-muted-foreground">입고대기 기본</span>
        )}
      </span>
    ),
  },
  { id: 'zone', header: '구역', accessor: 'zone', sortable: true },
  { id: 'aisle', header: '열', accessor: 'aisle', sortable: true },
  { id: 'level', header: '단', accessor: 'level', sortable: true },
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

// 로케이션 목록: 센터 → 창고 → 구역 고르기, 여러 개 골라 사용 중지·다시 사용·삭제
export function LocationsGrid({
  warehouses,
  initialWarehouseId,
}: {
  warehouses: WarehouseOption[]
  // 창고 상세의 [로케이션 관리]로 들어오면 그 창고를 미리 고른다
  initialWarehouseId?: string
}) {
  const { can } = usePermission()
  const initial = warehouses.find((w) => w.id === initialWarehouseId)
  const [filter, setFilter] = useState<LocationFilter>({
    centerId: initial?.centerId ?? ALL,
    warehouseId: initial?.id ?? ALL,
    zone: ALL,
  })
  const [state, setState] = useDataGridState('master-locations')
  const [result, setResult] = useState<{ rows: Row[]; rowCount: number; zones: string[] }>({
    rows: [],
    rowCount: 0,
    zones: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // 일괄 처리 후 다시 조회 + 선택 초기화 (그리드를 새로 그린다)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const pick = (v: string) => (v === ALL ? undefined : v)
    listLocationsAction({
      ...state,
      centerId: pick(filter.centerId),
      warehouseId: pick(filter.warehouseId),
      zone: pick(filter.zone),
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
  }, [state, filter, version])

  function reload() {
    setSelectedIds([])
    setLoading(true)
    setVersion((v) => v + 1)
  }

  const count = selectedIds.length
  const bulkButtons = count > 0 && (
    <>
      {can('master.locations.update') && (
        <>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline">
                <PowerIcon />
                사용 중지
              </Button>
            }
            title={`로케이션 ${count}개를 사용 중지할까요?`}
            description="사용 중지한 로케이션에는 새로 적치할 수 없습니다. 기록은 남습니다."
            confirmLabel="사용 중지"
            destructive
            onConfirm={async () => {
              unwrap(await setLocationsActiveAction({ ids: selectedIds, isActive: false }))
              reload()
            }}
          />
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline">
                다시 사용
              </Button>
            }
            title={`로케이션 ${count}개를 다시 사용할까요?`}
            confirmLabel="다시 사용"
            onConfirm={async () => {
              unwrap(await setLocationsActiveAction({ ids: selectedIds, isActive: true }))
              reload()
            }}
          />
        </>
      )}
      {can('master.locations.delete') && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive">
              <Trash2Icon />
              삭제
            </Button>
          }
          title={`로케이션 ${count}개를 삭제할까요?`}
          description="한 번도 쓰이지 않은 로케이션만 삭제됩니다. 되돌릴 수 없습니다."
          confirmLabel="삭제"
          destructive
          onConfirm={async () => {
            unwrap(await deleteLocationsAction({ ids: selectedIds }))
            reload()
          }}
        />
      )}
    </>
  )

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <LocationFilters
          warehouses={warehouses}
          zones={result.zones}
          value={filter}
          onChange={(next) => {
            setFilter(next)
            setState({ ...state, pageIndex: 0 })
            setSelectedIds([])
            setLoading(true)
          }}
        />
        {can('master.locations.create') && (
          <div className="flex gap-2">
            <AddLocationDialog
              warehouses={warehouses}
              initialWarehouseId={filter.warehouseId === ALL ? undefined : filter.warehouseId}
              onAdded={reload}
            />
            <Button asChild>
              <Link
                href={`/admin/master/locations/bulk${filter.warehouseId === ALL ? '' : `?warehouseId=${filter.warehouseId}`}`}
              >
                <LayersIcon />
                일괄 생성
              </Link>
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <DataGrid
        key={version}
        id="master-locations"
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
        enableRowSelection={can('master.locations.update') || can('master.locations.delete')}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="로케이션 코드 검색"
        empty={{ title: '등록된 로케이션이 없습니다' }}
        toolbarActions={bulkButtons}
      />
    </>
  )
}
