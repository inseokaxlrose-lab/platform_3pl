'use client'

import { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { REGION_CHANGE_TYPE, TEMP_ZONE_ALL } from '@/lib/regions/region-codes'
import { getRegionBatchDetailAction, listRegionBatchesAction } from './actions'

// 변경 이력 탭: 작업 단위(한 번의 저장) 목록 → 고르면 우편번호별 전·후 센터

type Batch = {
  id: string
  changeType: string
  scopeDesc: string
  tempZone: string
  changedCount: number
  reason: string | null
  createdAt: Date
  createdBy: string
  targetCenter: { name: string } | null
}
type Detail = {
  id: string
  zipCode: string
  tempZone: string
  before: string | null
  after: string | null
}

const tempLabel = (tempZone: string) =>
  tempZone === TEMP_ZONE_ALL ? '전체' : TEMP_ZONE.labels[tempZone as TempZoneKey]

export function RegionHistory({ reloadKey }: { reloadKey: number }) {
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [picked, setPicked] = useState<Batch | null>(null)
  // 우편번호별 내역: 어느 작업의 것인지 붙여 둔다
  const [loadedDetail, setLoadedDetail] = useState<{ batchId: string; rows: Detail[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRegionBatchesAction({}).then((result) => {
      if (result.ok) setBatches(result.data)
      else setError(result.error.message)
    })
  }, [reloadKey])

  useEffect(() => {
    if (!picked) return
    getRegionBatchDetailAction({ batchId: picked.id }).then((result) => {
      if (result.ok) setLoadedDetail({ batchId: picked.id, rows: result.data })
      else setError(result.error.message)
    })
  }, [picked])
  const detail = picked && loadedDetail?.batchId === picked.id ? loadedDetail.rows : null

  const batchColumns = useMemo<DataGridColumn<Batch>[]>(
    () => [
      { id: 'createdAt', header: '일시', accessor: 'createdAt', format: 'datetime', width: 140 },
      {
        id: 'changeType',
        header: '작업',
        accessor: (b) => REGION_CHANGE_TYPE.labels[b.changeType as 'PASTE'] ?? b.changeType,
        width: 130,
      },
      {
        id: 'scopeDesc',
        header: '범위',
        accessor: 'scopeDesc',
        width: 360,
        cell: (b) => (
          <button
            type="button"
            className="truncate text-left text-primary hover:underline"
            onClick={() => setPicked(b)}
          >
            {b.scopeDesc}
          </button>
        ),
      },
      { id: 'tempZone', header: '온도대', accessor: (b) => tempLabel(b.tempZone), width: 80 },
      {
        id: 'changedCount',
        header: '변경 건수',
        accessor: 'changedCount',
        format: 'number',
        width: 90,
      },
      { id: 'reason', header: '사유', accessor: 'reason', width: 200 },
      { id: 'createdBy', header: '작업자', accessor: 'createdBy', width: 110 },
    ],
    [],
  )
  const detailColumns = useMemo<DataGridColumn<Detail>[]>(
    () => [
      { id: 'zipCode', header: '우편번호', accessor: 'zipCode', width: 96 },
      { id: 'tempZone', header: '온도대', accessor: (d) => tempLabel(d.tempZone), width: 80 },
      {
        id: 'before',
        header: '변경 전',
        accessor: 'before',
        width: 150,
        cell: (d) => (d.before ? d.before : <StatusBadge tone="warning">미배정</StatusBadge>),
      },
      {
        id: 'after',
        header: '변경 후',
        accessor: 'after',
        width: 150,
        cell: (d) => (d.after ? d.after : <StatusBadge tone="warning">배정 해제</StatusBadge>),
      },
    ],
    [],
  )

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )
  }
  return (
    <div className="space-y-6">
      <LocalDataGrid
        id="region-batches"
        columns={batchColumns}
        rows={batches ?? []}
        getRowId={(b) => b.id}
        empty={{ title: batches ? '아직 변경한 적이 없습니다.' : '불러오는 중…' }}
      />
      {picked && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            {picked.scopeDesc}
            <span className="ml-2 font-normal text-muted-foreground">우편번호별 변경 내역</span>
          </h3>
          {picked.changeType === 'CONFIRM' && (
            <p className="text-xs text-muted-foreground">
              추천 확인은 센터가 바뀌지 않아 우편번호별 내역이 없습니다 ({picked.changedCount}건
              확인).
            </p>
          )}
          <LocalDataGrid
            key={picked.id}
            id="region-batch-detail"
            columns={detailColumns}
            rows={detail ?? []}
            getRowId={(d) => d.id}
            empty={{ title: detail ? '바뀐 우편번호가 없습니다.' : '불러오는 중…' }}
          />
        </section>
      )}
    </div>
  )
}
