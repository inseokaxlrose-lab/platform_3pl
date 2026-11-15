'use client'

import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SearchSelectOption = {
  value: string
  label: string
  // 이름표 아래 작게 (예: 품목의 규격·기본단위)
  description?: string
  // 검색에 함께 쓰는 글자 (예: 바코드)
  keywords?: string
  disabled?: boolean
}

type SearchSelectProps = {
  options: readonly SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  // 한 번에 보여 줄 최대 건수 (많으면 검색어로 좁힌다)
  maxResults?: number
}

// 검색해서 하나 고르기 (선택지가 많은 경우: 품목 등). 버튼을 누르면 검색 칸 + 목록이 열린다
// 검색은 이름표·설명·keywords에서 대소문자 없이 찾는다
export function SearchSelect({
  options,
  value,
  onChange,
  id,
  placeholder = '선택',
  searchPlaceholder = '검색',
  emptyText = '찾는 항목이 없습니다.',
  disabled,
  invalid,
  className,
  maxResults = 100,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? options.filter((o) =>
          `${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q),
        )
      : options
    return matches.slice(0, maxResults)
  }, [options, query, maxResults])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-2">
        <div className="relative mb-2">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter: 검색 결과가 하나면 바로 고른다
              if (e.key === 'Enter') {
                e.preventDefault()
                const enabled = filtered.filter((o) => !o.disabled)
                if (enabled.length === 1) pick(enabled[0].value)
              }
            }}
          />
        </div>
        <ul role="listbox" className="max-h-64 space-y-0.5 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyText}</li>
          )}
          {filtered.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                onClick={() => pick(option.value)}
                className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              >
                <CheckIcon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {options.length > filtered.length && !query && (
          <p className="mt-2 px-2 text-xs text-muted-foreground">
            {filtered.length}건까지 보여 줍니다. 검색어로 좁혀 주세요.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
