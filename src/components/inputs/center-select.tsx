'use client'

import { useEffect } from 'react'
import { SearchSelect } from './search-select'

// 센터 선택지: 화면을 그리는 서버 쪽에서 데이터 범위·상태를 거르고 정렬순서 → 코드 순으로 넘긴다
export type CenterSelectOption = { id: string; code: string; name: string }

// 센터 고르기 (권장 span 4, docs/decisions/0074). 고를 센터가 하나뿐이면 저절로 고른다
// 목록 검색 조건에서도 쓴다 (SearchFieldDef type 'custom'의 render)
export function CenterSelect({
  options,
  value,
  onChange,
  id,
  disabled,
  invalid,
  placeholder = '센터 선택',
  autoSelectSingle = true,
  allowAll = false,
}: {
  options: readonly CenterSelectOption[]
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  // 하나뿐이면 저절로 고르기 (검색 조건처럼 "전체"가 의미 있으면 false)
  autoSelectSingle?: boolean
  // 맨 위에 "전체"(값 '') 선택지 — 목록 검색 조건용 (이때는 저절로 고르지 않는다)
  allowAll?: boolean
}) {
  const only = options.length === 1 ? options[0].id : null
  const autoSelect = autoSelectSingle && !allowAll
  useEffect(() => {
    if (autoSelect && !disabled && only && value === '') onChange(only)
  }, [autoSelect, disabled, only, value, onChange])

  return (
    <SearchSelect
      id={id}
      options={[
        ...(allowAll ? [{ value: '', label: '전체' }] : []),
        ...options.map((c) => ({
          value: c.id,
          label: `${c.name} (${c.code})`,
          keywords: c.code,
        })),
      ]}
      value={value}
      onChange={onChange}
      disabled={disabled}
      invalid={invalid}
      placeholder={placeholder}
      searchPlaceholder="센터명·코드 검색"
      emptyText="찾는 센터가 없습니다."
      className="w-full"
    />
  )
}
