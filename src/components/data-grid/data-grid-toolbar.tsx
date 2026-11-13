'use client'

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  Columns3Icon,
  DownloadIcon,
  Rows3Icon,
  Rows4Icon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatNumber } from './format'
import type { DataGridDensity } from './types'

const SEARCH_DELAY_MS = 300

type ColumnItem = { id: string; header: string; visible: boolean; hideable: boolean }

type ColumnSettings = {
  // 지금 보이는 순서대로
  items: ColumnItem[]
  onToggle: (id: string, visible: boolean) => void
  onMove: (id: string, delta: -1 | 1) => void
  // 기본값 되돌리기: 숨김·순서·너비·행 높이·건수·정렬 전부
  onReset: () => void
}

export type ExportMode = 'all' | 'selected'

type ExportOption = {
  totalCount: number
  busy: boolean
  error: string | null
  onExport: (mode: ExportMode) => void
}

type DataGridToolbarProps = {
  search?: { value: string; placeholder?: string; onChange: (value: string) => void }
  selectedCount: number
  onClearSelection: () => void
  density: DataGridDensity
  onDensityChange: (density: DataGridDensity) => void
  columns?: ColumnSettings
  // 화면별 버튼 (예: 선택 행 일괄 처리)
  actions?: React.ReactNode
  // CSV 내보내기 (DataGrid에 exportCsv를 줬을 때만)
  exporting?: ExportOption
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
  exporting,
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
        {exporting?.error && (
          <p role="alert" className="text-sm text-destructive">
            {exporting.error}
          </p>
        )}
        {actions}
        {exporting && <ExportMenu {...exporting} selectedCount={selectedCount} />}
        <Button
          variant="outline"
          size="icon"
          aria-label={density === 'compact' ? '행 높이 넓게' : '행 높이 촘촘하게'}
          title={density === 'compact' ? '행 높이 넓게' : '행 높이 촘촘하게'}
          onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
        >
          {density === 'compact' ? <Rows3Icon /> : <Rows4Icon />}
        </Button>
        {columns && <ColumnMenu {...columns} />}
      </div>
    </div>
  )
}

// 컬럼 설정: 표시 여부(체크) · 순서(위/아래) · 기본값 되돌리기
// 메뉴 대신 팝오버: 줄 안의 체크박스·버튼을 Tab 키로 차례로 오갈 수 있게
function ColumnMenu({ items, onToggle, onMove, onReset }: ColumnSettings) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Columns3Icon />
          컬럼
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">컬럼 표시 · 순서</p>
        <ul aria-label="컬럼 목록">
          {items.map((item, index) => {
            const checkboxId = `grid-column-${item.id}`
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
              >
                <Checkbox
                  id={checkboxId}
                  checked={item.visible}
                  disabled={!item.hideable}
                  onCheckedChange={(checked) => onToggle(item.id, checked === true)}
                />
                <label htmlFor={checkboxId} className="flex-1 truncate">
                  {item.header}
                </label>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${item.header} 위로`}
                  disabled={index === 0}
                  onClick={() => onMove(item.id, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${item.header} 아래로`}
                  disabled={index === items.length - 1}
                  onClick={() => onMove(item.id, 1)}
                >
                  <ArrowDownIcon />
                </Button>
              </li>
            )
          })}
        </ul>
        <div className="border-t pt-1">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onReset}>
            <RotateCcwIcon />
            기본값 되돌리기
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// 내보내기 메뉴: 조건에 맞는 전체 / 선택 행만
function ExportMenu({
  totalCount,
  selectedCount,
  busy,
  onExport,
}: ExportOption & { selectedCount: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy}>
          <DownloadIcon />
          {busy ? '내보내는 중…' : '내보내기'}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuLabel>CSV 내보내기</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={totalCount === 0} onSelect={() => onExport('all')}>
          조건에 맞는 전체 ({formatNumber(totalCount)}건)
        </DropdownMenuItem>
        {selectedCount > 0 && (
          <DropdownMenuItem onSelect={() => onExport('selected')}>
            선택 행만 ({formatNumber(selectedCount)}건)
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
