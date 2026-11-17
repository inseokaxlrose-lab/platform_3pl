'use client'

import { SearchSelect } from './search-select'

// 구역 선택지: 서버 쪽에서 범위를 거르고(사용 중인 구역) 정렬순서 → 코드 순으로 넘긴다
export type ZoneSelectOption = { id: string; warehouseId: string; code: string; name: string }

// 구역 고르기 (권장 span 4, docs/decisions/0075): 위의 WarehouseSelect에서 고른 창고의 구역만 보인다
// 창고를 고르지 않았으면 꺼진다. allowAll = 맨 위 "전체"(검색 조건), allowNone = 맨 위 "구역 없음"(입력)
export function ZoneSelect({
  options,
  warehouseId,
  value,
  onChange,
  id,
  disabled,
  invalid,
  placeholder = '구역 선택',
  allowAll = false,
  allowNone = false,
}: {
  options: readonly ZoneSelectOption[]
  warehouseId: string
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  allowAll?: boolean
  allowNone?: boolean
}) {
  const inWarehouse = options.filter((z) => z.warehouseId === warehouseId)
  return (
    <SearchSelect
      id={id}
      options={[
        ...(allowAll ? [{ value: '', label: '전체' }] : []),
        ...(allowNone ? [{ value: '', label: '(구역 없음)' }] : []),
        ...inWarehouse.map((z) => ({
          value: z.id,
          label: `${z.code} · ${z.name}`,
          keywords: z.code,
        })),
      ]}
      value={value}
      onChange={onChange}
      disabled={disabled || !warehouseId}
      invalid={invalid}
      placeholder={warehouseId ? placeholder : '창고를 먼저 고르세요'}
      searchPlaceholder="구역코드·구역명 검색"
      emptyText="이 창고에 구역이 없습니다. 창고 화면에서 만드세요."
      className="w-full"
    />
  )
}
