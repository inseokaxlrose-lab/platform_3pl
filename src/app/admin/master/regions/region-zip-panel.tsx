'use client'

import { AlertTriangleIcon } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { StatusBadge } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { REGION_ASSIGN_TYPE } from '@/lib/regions/region-codes'
import { confirmSuggestedAction, getRegionZipsAction } from './actions'
import { CenterPick, type AssignableCenter } from './center-pick'
import type { ChangeRequest } from './region-change-dialog'
import { NodeBadges, type TreeNode } from './region-tree'

// 고른 지역의 우편번호 표: 거르기(미배정·확인 필요·경계·센터) → 고르기 → [센터 지정]·[배정 해제]·[추천 확인]
// 지역 전체 지정은 표 위 [이 지역 전체 지정]

export type ZipRow = {
  zipCode: string
  bjdNames: string
  emdCount: number
  repAddress: string | null
  addressCount: number | null
  abolished: boolean
  centerId: string | null
  centerName: string | null
  centerStatus: string | null
  inherited: boolean
  assignType: string | null
  confirmed: boolean | null
  updatedAt: Date | null
  updatedBy: string | null
}

const ALL_CENTERS = '__all__'
const UNASSIGNED = '__none__'

export function RegionZipPanel({
  node,
  tempZone,
  centers,
  canUpdate,
  reloadKey,
  highlightZip,
  onRequest,
  onMessage,
}: {
  node: TreeNode
  tempZone: string
  centers: AssignableCenter[]
  canUpdate: boolean
  reloadKey: number
  highlightZip: string | null
  onRequest: (request: ChangeRequest) => void
  onMessage: (message: string) => void
}) {
  // 지금 보는 지역·온도대·새로고침 번호 — 불러온 결과·고른 줄에 붙여 두어, 바뀌면 자동으로 비운다
  const viewKey = `${node.level}:${node.code}|${tempZone}|${reloadKey}`
  const [loaded, setLoaded] = useState<{
    key: string
    rows: ZipRow[] | null
    error: string | null
  } | null>(null)
  const [picked, setPicked] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] })
  const [actionError, setActionError] = useState<string | null>(null)
  const rows = loaded?.key === viewKey ? loaded.rows : null
  const error = actionError ?? (loaded?.key === viewKey ? loaded.error : null)
  const selected = picked.key === viewKey ? picked.ids : []
  const [filters, setFilters] = useState({ unassigned: false, unconfirmed: false, boundary: false })
  const [centerFilter, setCenterFilter] = useState(ALL_CENTERS)
  const [nodeCenter, setNodeCenter] = useState('')
  const [rowCenter, setRowCenter] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    const key = `${node.level}:${node.code}|${tempZone}|${reloadKey}`
    getRegionZipsAction({ node: { level: node.level, code: node.code }, tempZone }).then(
      (result) => {
        if (cancelled) return
        setLoaded(
          result.ok
            ? { key, rows: result.data, error: null }
            : { key, rows: null, error: result.error.message },
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [node.level, node.code, tempZone, reloadKey])

  const shown = useMemo(() => {
    const list = (rows ?? []).filter(
      (r) =>
        (!filters.unassigned || r.centerId === null) &&
        (!filters.unconfirmed || r.confirmed === false) &&
        (!filters.boundary || r.emdCount > 1) &&
        (centerFilter === ALL_CENTERS ||
          (centerFilter === UNASSIGNED ? r.centerId === null : r.centerId === centerFilter)),
    )
    // 주소로 찾은 우편번호를 맨 위로
    return highlightZip
      ? [
          ...list.filter((r) => r.zipCode === highlightZip),
          ...list.filter((r) => r.zipCode !== highlightZip),
        ]
      : list
  }, [rows, filters, centerFilter, highlightZip])

  const centerOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows ?? []) if (r.centerId) map.set(r.centerId, r.centerName ?? '')
    return [...map.entries()]
  }, [rows])

  const columns = useMemo<DataGridColumn<ZipRow>[]>(
    () => [
      {
        id: 'zipCode',
        header: '우편번호',
        accessor: 'zipCode',
        width: 96,
        pinned: true,
        cell: (r) => (
          <span className={r.zipCode === highlightZip ? 'font-semibold text-primary' : undefined}>
            {r.zipCode}
          </span>
        ),
      },
      {
        id: 'bjdNames',
        header: '법정동',
        accessor: 'bjdNames',
        width: 180,
        cell: (r) => (
          <span
            className="flex items-center gap-1"
            title={r.emdCount > 1 ? '경계 우편번호: 여러 읍면동에 걸쳐 있습니다' : undefined}
          >
            {r.emdCount > 1 && <AlertTriangleIcon className="size-3.5 shrink-0 text-warning" />}
            <span className="truncate">{r.bjdNames}</span>
          </span>
        ),
      },
      { id: 'repAddress', header: '대표 주소', accessor: 'repAddress', width: 240 },
      {
        id: 'addressCount',
        header: '주소 수',
        accessor: 'addressCount',
        format: 'number',
        width: 80,
      },
      {
        id: 'center',
        header: '배송센터',
        accessor: 'centerName',
        width: 150,
        cell: (r) =>
          r.centerId === null ? (
            <StatusBadge tone="warning">미배정</StatusBadge>
          ) : (
            <span className="flex items-center gap-1">
              <StatusBadge tone={r.inherited ? 'neutral' : 'info'}>
                {r.inherited ? `전체: ${r.centerName}` : r.centerName}
              </StatusBadge>
              {r.centerStatus === 'SUSPENDED' && <StatusBadge tone="warning">일시중지</StatusBadge>}
            </span>
          ),
      },
      {
        id: 'assignType',
        header: '배정 구분',
        accessor: (r) => (r.assignType ? REGION_ASSIGN_TYPE.labels[r.assignType as 'MANUAL'] : ''),
        width: 100,
      },
      {
        id: 'confirmed',
        header: '확인',
        accessor: 'confirmed',
        width: 90,
        cell: (r) =>
          r.confirmed === false ? <StatusBadge tone="danger">확인 필요</StatusBadge> : null,
      },
      {
        id: 'abolished',
        header: '폐지',
        accessor: 'abolished',
        width: 70,
        cell: (r) => (r.abolished ? <StatusBadge tone="neutral">폐지</StatusBadge> : null),
      },
      {
        id: 'updatedAt',
        header: '최종 변경',
        accessor: 'updatedAt',
        format: 'datetime',
        width: 140,
      },
      { id: 'updatedBy', header: '변경자', accessor: 'updatedBy', width: 100, defaultHidden: true },
    ],
    [highlightZip],
  )

  const zipRequest = (centerId: string | null): ChangeRequest => ({
    title: centerId ? '고른 우편번호 센터 지정' : '고른 우편번호 배정 해제',
    target: { kind: 'zips', source: 'GRID', zips: selected },
    tempZone,
    centerId,
  })

  const confirm = () =>
    startTransition(async () => {
      const result = await confirmSuggestedAction({ zips: selected, tempZone })
      if (!result.ok) {
        setActionError(result.error.message)
        return
      }
      setActionError(null)
      onMessage(`추천 배정 ${result.data.count}건을 확인했습니다.`)
    })

  const toggleFilter = (key: keyof typeof filters) => (checked: boolean) =>
    setFilters((prev) => ({ ...prev, [key]: checked }))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-base font-semibold">{node.name}</h2>
          <span className="text-sm text-muted-foreground">
            우편번호 {node.zipCount.toLocaleString()}개
          </span>
          <NodeBadges node={node} />
        </div>
        {canUpdate && (
          <div className="flex items-center gap-2">
            <CenterPick
              centers={centers}
              tempZone={tempZone}
              value={nodeCenter}
              onChange={setNodeCenter}
              label="지역 전체 센터"
            />
            <Button
              type="button"
              size="sm"
              disabled={!nodeCenter}
              onClick={() =>
                onRequest({
                  title: `${node.name} 전체 센터 지정`,
                  target: {
                    kind: 'node',
                    node: { level: node.level, code: node.code },
                    includeBoundary: false,
                  },
                  tempZone,
                  centerId: nodeCenter,
                })
              }
            >
              이 지역 전체 지정
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onRequest({
                  title: `${node.name} 전체 배정 해제`,
                  target: {
                    kind: 'node',
                    node: { level: node.level, code: node.code },
                    includeBoundary: false,
                  },
                  tempZone,
                  centerId: null,
                })
              }
            >
              전체 해제
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {(
          [
            ['unassigned', '미배정만'],
            ['unconfirmed', '확인 필요만'],
            ['boundary', '경계 우편번호만'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <Checkbox
              id={`zip-filter-${key}`}
              checked={filters[key]}
              onCheckedChange={(v) => toggleFilter(key)(v === true)}
            />
            <Label htmlFor={`zip-filter-${key}`} className="font-normal">
              {label}
            </Label>
          </div>
        ))}
        <Select value={centerFilter} onValueChange={setCenterFilter}>
          <SelectTrigger className="h-8 w-40" aria-label="센터로 거르기">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CENTERS}>모든 센터</SelectItem>
            <SelectItem value={UNASSIGNED}>미배정</SelectItem>
            {centerOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">{shown.length.toLocaleString()}건</span>
      </div>

      {canUpdate && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <span className="font-medium">고른 {selected.length}건</span>
          <CenterPick
            centers={centers}
            tempZone={tempZone}
            value={rowCenter}
            onChange={setRowCenter}
          />
          <Button
            type="button"
            size="sm"
            disabled={!rowCenter}
            onClick={() => onRequest(zipRequest(rowCenter))}
          >
            센터 지정
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onRequest(zipRequest(null))}
          >
            배정 해제
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={confirm} disabled={pending}>
            추천 확인
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {rows === null && !error ? (
        <p className="text-sm text-muted-foreground">우편번호를 불러오는 중…</p>
      ) : (
        <LocalDataGrid
          key={viewKey}
          id="region-zips"
          columns={columns}
          rows={shown}
          getRowId={(r) => r.zipCode}
          enableRowSelection={canUpdate}
          onSelectionChange={(ids) => setPicked({ key: viewKey, ids })}
          empty={{ title: '조건에 맞는 우편번호가 없습니다.' }}
        />
      )}
    </div>
  )
}
