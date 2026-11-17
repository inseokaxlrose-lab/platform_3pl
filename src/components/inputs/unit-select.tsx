'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { unitOptionLabel, type UnitTypeValue } from '@/lib/units/unit-labels'

// 단위 고르기 (docs/decisions/0078): 운영사가 볼 수 있는 단위(시스템 기본 + 자기 운영사)를 정렬 순서대로
// - 선택지는 서버에서 getUnitOptions로 받아 넘긴다 (이미 정렬순서·코드 순)
// - types: 고를 수 있는 유형 (예: ['WEIGHT']). 비우면 전부
// - includeInactive: 사용 중지 단위도 보이기 (조회 화면용). 기본은 사용 중만 + 지금 값
// - 표시: "BOX · 박스"
export type UnitSelectOption = {
  id: string
  code: string
  name: string
  type: UnitTypeValue
  decimals: number
  isActive: boolean
}

// 보여 줄 선택지: 허용 유형만, 사용 중지 단위는 includeInactive이거나 지금 값일 때만
export function unitChoices(
  options: readonly UnitSelectOption[],
  {
    types,
    includeInactive = false,
    value = '',
  }: { types?: readonly UnitTypeValue[]; includeInactive?: boolean; value?: string },
) {
  return options.filter(
    (u) => (!types || types.includes(u.type)) && (includeInactive || u.isActive || u.id === value),
  )
}

export function UnitSelect({
  id,
  options,
  value,
  onChange,
  types,
  includeInactive = false,
  placeholder = '단위 고르기',
  disabled,
  invalid,
}: {
  id?: string
  options: readonly UnitSelectOption[]
  value: string
  onChange: (value: string, unit: UnitSelectOption | undefined) => void
  types?: readonly UnitTypeValue[]
  includeInactive?: boolean
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
}) {
  const shown = unitChoices(options, { types, includeInactive, value })
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) =>
        onChange(
          next,
          options.find((u) => u.id === next),
        )
      }
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {shown.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {unitOptionLabel(u)}
            {!u.isActive && <span className="text-muted-foreground"> · 사용 중지</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
