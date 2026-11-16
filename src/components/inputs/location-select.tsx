'use client'

import { SearchSelect, type SearchSelectOption } from './search-select'

// 로케이션 고르기 (권장 span 4). 선택지는 화면을 그리는 서버 쪽에서 범위(센터·창고)를 좁혀 넘긴다
// label = 로케이션 코드, description = 창고 유형·창고명, keywords = 창고 코드·로케이션 이름
export function LocationSelect({
  options,
  value,
  onChange,
  id,
  disabled,
  invalid,
  placeholder = '로케이션 선택',
}: {
  options: readonly SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
}) {
  return (
    <SearchSelect
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      invalid={invalid}
      placeholder={placeholder}
      searchPlaceholder="로케이션 코드·창고 검색"
      emptyText="찾는 로케이션이 없습니다."
      className="w-full"
    />
  )
}
