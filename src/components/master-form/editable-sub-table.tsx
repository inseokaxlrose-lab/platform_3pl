'use client'

import { PlusIcon, Trash2Icon } from 'lucide-react'
import { SectionToolbar } from '@/components/app-page/section-toolbar'
import { CodeSelect, EmailInput, PhoneInput } from '@/components/inputs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { FormErrors } from './use-master-form'

// 한 칸을 그릴 때 받는 값
export type SubTableCell<TRow> = {
  row: TRow
  index: number
  value: string
  onChange: (value: string) => void
  id: string
  invalid: boolean
  disabled: boolean
}

export type SubTableColumn<TRow> = {
  key: keyof TRow & string
  label: string
  required?: boolean
  // 넓은 화면의 칸 너비 (CSS grid 너비, 예: '9rem', '1fr', 'minmax(8rem,1fr)'). 기본 '1fr'
  width?: string
  // 입력 부품 종류 (기본 'text'). 그 밖의 입력은 render로 직접 그린다
  input?: 'text' | 'phone' | 'email' | { codeGroup: string }
  render?: (cell: SubTableCell<TRow>) => React.ReactNode
}

type EditableSubTableProps<TRow> = {
  // 폼 안의 이 목록 이름 (오류 위치·입력 id 앞부분, 예: 'contacts' → 'contacts.0.name')
  name: string
  rows: TRow[]
  onChange: (rows: TRow[]) => void
  columns: SubTableColumn<TRow>[]
  // [추가]로 넣을 빈 행
  createRow: () => TRow
  maxRows?: number
  minRows?: number
  // 목록 안에서 하나만 고르는 칸 (예: 대표 담당자). 값은 boolean
  primary?: { key: keyof TRow & string; label: string }
  // useMasterForm의 errors (행 오류 'name.0.key', 표 오류 'name')
  errors?: FormErrors
  addLabel?: string
  // 건수 단위 (예: '명' → "2 / 5명")
  countUnit?: string
  emptyText?: string
  disabled?: boolean
}

// 기준정보의 1:N 항목 인라인 편집 표 (담당자·계좌·인증서 등, docs/ui-guidelines.md)
// - 넓은 화면은 한 행 = 한 줄, 좁은 화면은 행마다 세로 블록
// - 삭제는 확인 없이 바로 (저장 전이면 화면의 [취소]로 되돌릴 수 있다)
// - primary: 처음 추가한 행은 자동으로 대표, 대표 행을 지우면 남은 첫 행이 대표
export function EditableSubTable<TRow extends Record<string, unknown>>({
  name,
  rows,
  onChange,
  columns,
  createRow,
  maxRows = Infinity,
  minRows = 0,
  primary,
  errors = {},
  addLabel = '추가',
  countUnit = '개',
  emptyText = '등록된 항목이 없습니다.',
  disabled = false,
}: EditableSubTableProps<TRow>) {
  const template = [
    ...columns.map((c) => c.width ?? 'minmax(0,1fr)'),
    ...(primary ? ['3.5rem'] : []),
    '2.25rem',
  ].join(' ')
  const tableError = errors[name]
  const full = rows.length >= maxRows

  // 대표가 정확히 하나가 되게 맞춘다 (행이 있는데 대표가 없으면 첫 행)
  const withPrimary = (next: TRow[]) => {
    if (!primary || next.length === 0 || next.some((r) => r[primary.key] === true)) return next
    return next.map((r, i) => ({ ...r, [primary.key]: i === 0 }))
  }
  const update = (index: number, patch: Partial<TRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  function renderCell(column: SubTableColumn<TRow>, row: TRow, index: number) {
    const key = `${name}.${index}.${column.key}`
    const cell: SubTableCell<TRow> = {
      row,
      index,
      value: String(row[column.key] ?? ''),
      onChange: (value) => update(index, { [column.key]: value } as Partial<TRow>),
      id: `${name}-${index}-${column.key}`,
      invalid: Boolean(errors[key]),
      disabled,
    }
    if (column.render) return column.render(cell)
    const common = {
      id: cell.id,
      value: cell.value,
      disabled,
      'aria-invalid': cell.invalid,
    }
    if (column.input === 'phone') return <PhoneInput {...common} onChange={cell.onChange} />
    if (column.input === 'email') {
      return <EmailInput {...common} onChange={(e) => cell.onChange(e.target.value)} />
    }
    if (typeof column.input === 'object') {
      return (
        <CodeSelect
          group={column.input.codeGroup}
          id={cell.id}
          value={cell.value}
          onChange={cell.onChange}
          disabled={disabled}
          invalid={cell.invalid}
        />
      )
    }
    return <Input {...common} onChange={(e) => cell.onChange(e.target.value)} />
  }

  return (
    <div className="space-y-3">
      {/* 목록 그리드와 같은 툴바 배치: 왼쪽 건수, 오른쪽 [+ 추가] (표 위) */}
      <SectionToolbar
        start={
          <span className={cn('text-muted-foreground tabular-nums', full && 'text-warning')}>
            {Number.isFinite(maxRows)
              ? `${rows.length} / ${maxRows}${countUnit}${full ? ' (최대)' : ''}`
              : `${rows.length}${countUnit}`}
          </span>
        }
        end={
          !disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              onClick={() => onChange(withPrimary([...rows, createRow()]))}
            >
              <PlusIcon />
              {addLabel}
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div role="table" aria-label={name} className="space-y-3 md:space-y-0">
          {/* 머리글: 넓은 화면에서만 */}
          <div
            role="row"
            className="hidden gap-2 border-b pb-2 text-xs font-medium text-muted-foreground md:grid"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((c) => (
              <span role="columnheader" key={c.key}>
                {c.label}
                {c.required && <span className="text-destructive"> *</span>}
              </span>
            ))}
            {primary && (
              <span role="columnheader" className="text-center">
                {primary.label}
              </span>
            )}
            <span role="columnheader" className="sr-only">
              삭제
            </span>
          </div>

          {rows.map((row, index) => (
            <div
              role="row"
              key={index}
              aria-label={`${index + 1}번째 행`}
              className="grid gap-3 rounded-md border p-3 md:items-start md:gap-2 md:rounded-none md:border-0 md:border-b md:px-0 md:py-2"
            >
              {/* 넓은 화면의 줄 배치는 안쪽 격자에서 (좁은 화면은 위아래로 쌓인다) */}
              <div className="contents md:grid md:gap-2" style={{ gridTemplateColumns: template }}>
                {columns.map((column) => {
                  const error = errors[`${name}.${index}.${column.key}`]
                  return (
                    <div role="cell" key={column.key} className="grid min-w-0 content-start gap-1">
                      <label
                        htmlFor={`${name}-${index}-${column.key}`}
                        className="text-xs font-medium text-muted-foreground md:sr-only"
                      >
                        {column.label}
                        {column.required && <span className="text-destructive"> *</span>}
                      </label>
                      {renderCell(column, row, index)}
                      {error && (
                        <p role="alert" className="text-xs text-destructive">
                          {error}
                        </p>
                      )}
                    </div>
                  )
                })}
                {primary && (
                  <div role="cell" className="flex h-9 items-center gap-2 md:justify-center">
                    <input
                      type="radio"
                      id={`${name}-${index}-${primary.key}`}
                      name={`${name}-${primary.key}`}
                      className="size-4 accent-primary"
                      checked={row[primary.key] === true}
                      disabled={disabled}
                      onChange={() =>
                        onChange(rows.map((r, i) => ({ ...r, [primary.key]: i === index })))
                      }
                    />
                    <label
                      htmlFor={`${name}-${index}-${primary.key}`}
                      className="text-sm md:sr-only"
                    >
                      {primary.label}
                    </label>
                  </div>
                )}
                <div role="cell" className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${index + 1}번째 행 삭제`}
                    disabled={disabled || rows.length <= minRows}
                    onClick={() => onChange(withPrimary(rows.filter((_, i) => i !== index)))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tableError && (
        <p role="alert" className="text-sm text-destructive">
          {tableError}
        </p>
      )}
    </div>
  )
}
