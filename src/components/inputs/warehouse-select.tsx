'use client'

import { useEffect } from 'react'
import { SearchSelect } from './search-select'

// 창고 선택지: 서버 쪽에서 범위를 거르고 (보통 사용 중인 창고만) 정렬순서 → 코드 순으로 넘긴다
export type WarehouseSelectOption = {
  id: string
  centerId: string
  code: string
  name: string
  // 이름표 아래 작게 (예: 창고 유형·온도대)
  description?: string
}

// 창고 고르기 (권장 span 4, docs/decisions/0074): 위의 CenterSelect에서 고른 센터의 창고만 보인다
// 센터를 고르지 않았으면 꺼진다. 그 센터에 창고가 하나뿐이면 저절로 고른다
export function WarehouseSelect({
  options,
  centerId,
  value,
  onChange,
  id,
  disabled,
  invalid,
  placeholder = '창고 선택',
  autoSelectSingle = true,
  allowAll = false,
}: {
  options: readonly WarehouseSelectOption[]
  // 고른 센터 (비면 꺼짐)
  centerId: string
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  autoSelectSingle?: boolean
  // 맨 위에 "전체"(값 '') 선택지 — 목록 검색 조건용 (이때는 저절로 고르지 않는다)
  allowAll?: boolean
}) {
  const inCenter = options.filter((w) => w.centerId === centerId)
  const only = inCenter.length === 1 ? inCenter[0].id : null
  const autoSelect = autoSelectSingle && !allowAll
  useEffect(() => {
    if (autoSelect && !disabled && only && value === '') onChange(only)
  }, [autoSelect, disabled, only, value, onChange])

  return (
    <SearchSelect
      id={id}
      options={[
        ...(allowAll ? [{ value: '', label: '전체' }] : []),
        ...inCenter.map((w) => ({
          value: w.id,
          label: `${w.name} (${w.code})`,
          description: w.description,
          keywords: w.code,
        })),
      ]}
      value={value}
      onChange={onChange}
      disabled={disabled || !centerId}
      invalid={invalid}
      placeholder={centerId ? placeholder : '센터를 먼저 고르세요'}
      searchPlaceholder="창고명·코드 검색"
      emptyText="이 센터에 고를 수 있는 창고가 없습니다."
      className="w-full"
    />
  )
}
