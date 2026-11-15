'use client'

import { ChevronDownIcon, RotateCcwIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import {
  BizNoInput,
  CodeMultiSelect,
  CodeSelect,
  DateRangeInput,
  MultiSelect,
  NumberInput,
  PhoneInput,
} from '@/components/inputs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  applySearchChange,
  optionsOf,
  type SearchFieldDef,
  type SearchValues,
} from './search-fields'

const SPAN_CLASS: Record<number, string> = {
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  12: 'md:col-span-12',
}
const spanOf = (field: SearchFieldDef) => field.span ?? (field.type === 'keyword' ? 4 : 3)
const ALL = '__all__'
const splitList = (value: string) => (value ? value.split(',') : [])
const splitRange = (value: string) => {
  const [from = '', to = ''] = value.split('~')
  return { from, to }
}
const joinRange = (from: string, to: string) => (from || to ? `${from}~${to}` : '')

// 버튼 묶음 (전체 / 사용 / 중지): 값 '' = 전체
function Segment({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}) {
  const choices = [{ value: '', label: '전체' }, ...options]
  return (
    <div id={id} role="radiogroup" aria-label={label} className="flex h-9 rounded-md border p-0.5">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={value === choice.value}
          onClick={() => onChange(choice.value)}
          className={cn(
            'flex-1 rounded-sm px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
            value === choice.value &&
              'bg-primary text-primary-foreground hover:text-primary-foreground',
          )}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}

// 조건 하나의 입력 (종류별 공통 부품)
function SearchInput({
  field,
  id,
  value,
  values,
  onChange,
}: {
  field: SearchFieldDef
  id: string
  value: string
  // 다른 조건 값 (선택지가 다른 조건에 따라 바뀔 때)
  values: SearchValues
  onChange: (value: string) => void
}) {
  const options = optionsOf(field, values)
  switch (field.type) {
    case 'keyword':
    case 'text':
      return (
        <Input
          id={id}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'bizNo':
      return (
        <BizNoInput id={id} value={value} onChange={onChange} placeholder={field.placeholder} />
      )
    case 'phone':
      return (
        <PhoneInput id={id} value={value} onChange={onChange} placeholder={field.placeholder} />
      )
    case 'select':
      return (
        <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'segment':
      return (
        <Segment id={id} label={field.label} value={value} onChange={onChange} options={options} />
      )
    case 'yn': {
      const [yes, no] = field.ynLabels ?? ['예', '아니오']
      return (
        <Segment
          id={id}
          label={field.label}
          value={value}
          onChange={onChange}
          options={[
            { value: 'Y', label: yes },
            { value: 'N', label: no },
          ]}
        />
      )
    }
    case 'multi':
      return (
        <MultiSelect
          id={id}
          options={options}
          value={splitList(value)}
          onChange={(list) => onChange(list.join(','))}
        />
      )
    case 'code':
      return (
        <CodeSelect
          id={id}
          group={field.codeGroup ?? ''}
          value={value}
          onChange={onChange}
          allowEmpty
          placeholder="전체"
        />
      )
    case 'codeMulti':
      return (
        <CodeMultiSelect
          id={id}
          group={field.codeGroup ?? ''}
          value={splitList(value)}
          onChange={(list) => onChange(list.join(','))}
        />
      )
    case 'dateRange': {
      const range = splitRange(value)
      return (
        <DateRangeInput
          id={id}
          value={range}
          onChange={(next) => onChange(joinRange(next.from, next.to))}
        />
      )
    }
    case 'numberRange': {
      const range = splitRange(value)
      const toNumber = (text: string) => (text === '' ? null : Number(text))
      const toText = (n: number | null) => (n === null ? '' : String(n))
      return (
        <div className="flex items-center gap-2">
          <NumberInput
            id={id}
            aria-label={`${field.label} 최소`}
            value={toNumber(range.from)}
            onChange={(n) => onChange(joinRange(toText(n), range.to))}
          />
          <span className="text-muted-foreground">~</span>
          <NumberInput
            aria-label={`${field.label} 최대`}
            value={toNumber(range.to)}
            onChange={(n) => onChange(joinRange(range.from, toText(n)))}
          />
        </div>
      )
    }
    case 'custom':
      return <>{field.render?.({ id, value, onChange })}</>
  }
}

type SearchPanelProps = {
  fields: readonly SearchFieldDef[]
  // 지금 적용된 조건 (URL에서 읽은 값). 바뀌면 입력칸도 그 값으로 다시 채운다
  values: SearchValues
  onSearch: (values: SearchValues) => void
  onReset: () => void
}

// 목록 검색 영역: 기본 조건 + [상세 조건] 펼치기, Enter·[조회]로 조회, [초기화]
// 입력 중인 값은 [조회]를 눌러야 적용된다 (그 전에는 목록이 바뀌지 않음)
export function SearchPanel({ fields, values, onSearch, onReset }: SearchPanelProps) {
  const [draft, setDraft] = useState<SearchValues>(values)
  // 적용된 조건이 바뀌면(뒤로 가기·초기화·URL 공유) 입력칸을 다시 채운다
  const [appliedKey, setAppliedKey] = useState(JSON.stringify(values))
  if (JSON.stringify(values) !== appliedKey) {
    setAppliedKey(JSON.stringify(values))
    setDraft(values)
  }
  const basic = fields.filter((f) => !f.detail)
  const detail = fields.filter((f) => f.detail)
  const activeDetail = detail.filter((f) => values[f.key]).length
  // 버튼은 기본 조건 줄의 남은 칸에 (3칸 미만이면 다음 줄 전체)
  const used = basic.reduce((sum, f) => sum + spanOf(f), 0) % 12
  const buttonSpan = 12 - used >= 3 ? 12 - used : 12
  // 상세 조건이 적용돼 있으면 펼친 채로 시작
  const [open, setOpen] = useState(activeDetail > 0)

  const renderField = (field: SearchFieldDef) => {
    const id = `search-${field.key}`
    const span = spanOf(field)
    const labelled = field.type !== 'segment' && field.type !== 'yn'
    return (
      <div key={field.key} className={cn('grid min-w-0 content-start gap-2', SPAN_CLASS[span])}>
        {labelled ? (
          <Label htmlFor={id}>{field.label}</Label>
        ) : (
          <span className="text-sm leading-none font-medium">{field.label}</span>
        )}
        <SearchInput
          field={field}
          id={id}
          value={draft[field.key] ?? ''}
          values={draft}
          onChange={(value) => setDraft((d) => applySearchChange(fields, d, field.key, value))}
        />
      </div>
    )
  }

  return (
    <form
      role="search"
      className="mb-4 rounded-lg border bg-card p-4 text-card-foreground"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(draft)
      }}
    >
      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-12">
        {basic.map(renderField)}
        <div
          className={cn(
            'flex flex-wrap items-center justify-end gap-2',
            SPAN_CLASS[buttonSpan] ?? 'md:col-span-12',
          )}
        >
          {detail.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="mr-auto"
            >
              상세 조건{activeDetail > 0 && ` (${activeDetail})`}
              <ChevronDownIcon className={cn('transition-transform', open && 'rotate-180')} />
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcwIcon />
            초기화
          </Button>
          <Button type="submit">
            <SearchIcon />
            조회
          </Button>
        </div>
      </div>
      {open && detail.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-12">
          {detail.map(renderField)}
        </div>
      )}
    </form>
  )
}
