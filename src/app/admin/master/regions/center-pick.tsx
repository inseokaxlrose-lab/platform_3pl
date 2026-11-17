'use client'

import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TEMP_ZONE_ALL } from '@/lib/regions/region-codes'

// 배정할 센터 고르기: 준비중·운영중 센터, 온도대를 고른 상태면 그 온도대를 취급하는 센터만

export type AssignableCenter = {
  id: string
  code: string
  name: string
  status: string
  tempZones: { tempZoneCd: string }[]
}

export const handles = (center: AssignableCenter, tempZone: string) =>
  tempZone === TEMP_ZONE_ALL || center.tempZones.some((z) => z.tempZoneCd === tempZone)

export function CenterPick({
  centers,
  tempZone,
  value,
  onChange,
  label = '센터 고르기',
  disabled,
}: {
  centers: AssignableCenter[]
  tempZone: string
  value: string
  onChange: (id: string) => void
  label?: string
  disabled?: boolean
}) {
  const usable = centers.filter((c) => handles(c, tempZone))
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || usable.length === 0}>
      <SelectTrigger className="w-44" aria-label={label}>
        <SelectValue
          placeholder={
            usable.length === 0
              ? tempZone === TEMP_ZONE_ALL
                ? '배정할 센터 없음'
                : `${TEMP_ZONE.labels[tempZone as TempZoneKey]} 취급 센터 없음`
              : label
          }
        />
      </SelectTrigger>
      <SelectContent>
        {usable.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {c.status === 'PREPARING' && <span className="text-muted-foreground"> (준비중)</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
