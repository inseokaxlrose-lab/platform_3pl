'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WarehouseOption } from './queries'

export const ALL = 'all'

export type LocationFilter = { centerId: string; warehouseId: string; zone: string }

// 센터 → 창고 → 구역 고르기 (창고는 고른 센터의 것만, 구역은 창고를 골랐을 때만)
export function LocationFilters({
  warehouses,
  zones,
  value,
  onChange,
}: {
  warehouses: WarehouseOption[]
  zones: string[]
  value: LocationFilter
  onChange: (value: LocationFilter) => void
}) {
  const centers = [...new Map(warehouses.map((w) => [w.centerId, w.centerLabel])).entries()]
  const centerWarehouses = warehouses.filter(
    (w) => value.centerId === ALL || w.centerId === value.centerId,
  )

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={value.centerId}
        onValueChange={(centerId) => onChange({ centerId, warehouseId: ALL, zone: ALL })}
      >
        <SelectTrigger aria-label="센터 고르기" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>모든 센터</SelectItem>
          {centers.map(([id, label]) => (
            <SelectItem key={id} value={id}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.warehouseId}
        onValueChange={(warehouseId) => onChange({ ...value, warehouseId, zone: ALL })}
      >
        <SelectTrigger aria-label="창고 고르기" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>모든 창고</SelectItem>
          {centerWarehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {value.centerId === ALL ? `${w.centerLabel} · ${w.label}` : w.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.zone}
        onValueChange={(zone) => onChange({ ...value, zone })}
        disabled={value.warehouseId === ALL || zones.length === 0}
      >
        <SelectTrigger aria-label="구역 고르기" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>모든 구역</SelectItem>
          {zones.map((zone) => (
            <SelectItem key={zone} value={zone}>
              {zone} 구역
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
