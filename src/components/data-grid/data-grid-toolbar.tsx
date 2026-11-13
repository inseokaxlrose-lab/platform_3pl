'use client'

import { Columns3Icon, Rows3Icon, Rows4Icon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { formatNumber } from './format'
import type { DataGridDensity } from './types'

const SEARCH_DELAY_MS = 300

type ColumnToggleItem = { id: string; header: string; visible: boolean }

type DataGridToolbarProps = {
  search?: { value: string; placeholder?: string; onChange: (value: string) => void }
  selectedCount: number
  onClearSelection: () => void
  density: DataGridDensity
  onDensityChange: (density: DataGridDensity) => void
  columns?: { items: ColumnToggleItem[]; onToggle: (id: string, visible: boolean) => void }
  // 화면별 버튼 (예: 선택 행 일괄 처리)
  actions?: React.ReactNode
}

// 그리드 위 도구 줄: 검색 · 선택 건수 · 화면별 버튼 · 행 높이 · 컬럼 표시
export function DataGridToolbar({
  search,
  selectedCount,
  onClearSelection,
  density,
  onDensityChange,
  columns,
  actions,
}: DataGridToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && <SearchInput {...search} />}

      {selectedCount > 0 && (
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium tabular-nums">{formatNumber(selectedCount)}건 선택</span>
          <Button variant="ghost" size="icon-xs" aria-label="선택 해제" onClick={onClearSelection}>
            <XIcon />
          </Button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {actions}
        <Button
          variant="outline"
          size="icon"
          aria-label={density === 'compact' ? '행 높이 넓게' : '행 높이 촘촘하게'}
          title={density === 'compact' ? '행 높이 넓게' : '행 높이 촘촘하게'}
          onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
        >
          {density === 'compact' ? <Rows3Icon /> : <Rows4Icon />}
        </Button>
        {columns && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3Icon />
                컬럼
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              <DropdownMenuLabel>표시할 컬럼</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.items.map((item) => (
                <DropdownMenuCheckboxItem
                  key={item.id}
                  checked={item.visible}
                  // 여러 컬럼을 연달아 바꿀 수 있도록 선택해도 메뉴를 닫지 않는다
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => columns.onToggle(item.id, checked === true)}
                >
                  {item.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

// 검색 입력: 입력을 멈추고 0.3초 뒤에 검색한다 (글자마다 서버에 묻지 않기 위해)
function SearchInput({
  value,
  placeholder = '검색',
  onChange,
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  const [text, setText] = useState(value)
  const [prevValue, setPrevValue] = useState(value)

  // 바깥에서 검색어가 바뀌면(초기화 등) 입력칸도 맞춘다
  if (value !== prevValue) {
    setPrevValue(value)
    setText(value)
  }

  const commit = useEffectEvent((next: string) => onChange(next))

  useEffect(() => {
    if (text.trim() === value) return
    const timer = setTimeout(() => commit(text.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, value])

  return (
    <div className="relative w-full sm:w-64">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pl-8"
      />
    </div>
  )
}
