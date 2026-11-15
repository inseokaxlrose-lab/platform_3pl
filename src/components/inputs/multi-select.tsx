'use client'

import { ChevronDownIcon } from 'lucide-react'
import { useCodeOptions } from '@/components/common-code'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type MultiSelectOption = { value: string; label: string }

type MultiSelectProps = {
  options: readonly MultiSelectOption[]
  // 고른 값들 (없으면 전체)
  value: readonly string[]
  onChange: (value: string[]) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

// 여러 개 고르기 (검색 조건의 "상태 여러 개" 등): 버튼을 누르면 체크 목록이 열린다
// 하나도 안 고르면 '전체'
export function MultiSelect({
  options,
  value,
  onChange,
  id,
  placeholder = '전체',
  disabled,
  className,
}: MultiSelectProps) {
  const selected = options.filter((option) => value.includes(option.value))
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.map((option) => option.label).join(', ')
        : `${selected[0].label} 외 ${selected.length - 1}개`

  const toggle = (optionValue: string, checked: boolean) =>
    onChange(
      checked
        ? options.map((o) => o.value).filter((v) => v === optionValue || value.includes(v))
        : value.filter((v) => v !== optionValue),
    )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
            {summary}
          </span>
          <ChevronDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {options.map((option) => {
            const optionId = `${id ?? 'multi'}-${option.value}`
            return (
              <li key={option.value} className="flex items-center gap-2 rounded-sm px-1 py-1">
                <Checkbox
                  id={optionId}
                  checked={value.includes(option.value)}
                  onCheckedChange={(checked) => toggle(option.value, checked === true)}
                />
                <Label htmlFor={optionId} className="flex-1 font-normal">
                  {option.label}
                </Label>
              </li>
            )
          })}
        </ul>
        {value.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            onClick={() => onChange([])}
          >
            선택 해제 (전체)
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

// 공통코드 여러 개 고르기: 그룹만 넘기면 사용 중인 코드 목록 (0030)
export function CodeMultiSelect({
  group,
  ...props
}: Omit<MultiSelectProps, 'options'> & { group: string }) {
  const options = useCodeOptions(group)
    .filter((option) => option.isActive || props.value.includes(option.code))
    .map((option) => ({ value: option.code, label: option.name }))
  return <MultiSelect {...props} options={options} />
}
