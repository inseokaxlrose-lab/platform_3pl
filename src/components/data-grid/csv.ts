import { formatDate } from './format'
import type { DataGridColumn } from './types'

// 엑셀이 UTF-8로 알아보게 하는 표식(BOM): 없으면 엑셀에서 한글이 깨진다
const BOM = '﻿'
// 엑셀(Windows) 기본 줄바꿈
const LINE_BREAK = '\r\n'
// 엑셀이 수식으로 실행할 수 있는 첫 글자 (CSV 수식 주입 방지)
const FORMULA_START = /^[=+\-@\t\r]/
// 따옴표로 감싸야 하는 글자: 쉼표, 따옴표, 줄바꿈
const NEEDS_QUOTE = /[",\r\n]/

// 행에서 컬럼 값 꺼내기
function readValue<TData>(column: DataGridColumn<TData>, row: TData): unknown {
  return typeof column.accessor === 'function'
    ? column.accessor(row)
    : (row as Record<string, unknown>)[column.accessor]
}

// 셀 하나를 CSV에 넣을 글자로 바꾼다
// - 숫자: 쉼표 없이 원래 값 그대로 (엑셀에서 계산 가능, Decimal 정밀도 유지)
// - 날짜: 화면과 같은 한국 시간 서식 / 상태: 라벨
export function toExportText<TData>(column: DataGridColumn<TData>, row: TData): string {
  const value = readValue(column, row)
  if (value === null || value === undefined) return ''

  const format = column.format ?? 'text'
  if (typeof format === 'object') {
    return protectFormula(format.status[String(value)]?.label ?? String(value))
  }
  switch (format) {
    case 'number':
      return String(value).trim() // 음수(-12)는 수식이 아니므로 그대로 둔다
    case 'date':
      return formatDate(value) ?? ''
    case 'datetime':
      return formatDate(value, true) ?? ''
    default:
      return protectFormula(String(value))
  }
}

// 글자 값이 수식처럼 시작하면 앞에 '를 붙여 엑셀이 글자로만 보게 한다
function protectFormula(text: string) {
  return FORMULA_START.test(text) ? `'${text}` : text
}

// 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고, 안의 따옴표는 두 번 쓴다
function escapeCell(text: string) {
  return NEEDS_QUOTE.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// 컬럼(보이는 순서) + 행 → CSV 문자열 (첫 줄은 컬럼 제목)
export function toCsv<TData>(columns: DataGridColumn<TData>[], rows: TData[]): string {
  const header = columns.map((column) => escapeCell(protectFormula(column.header)))
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(toExportText(column, row))).join(','),
  )
  return BOM + [header.join(','), ...body].join(LINE_BREAK) + LINE_BREAK
}

// 파일 이름: 재고목록_20261113_1405.csv (한국 시간 기준)
export function csvFileName(baseName: string, now: Date = new Date()) {
  const stamp = (formatDate(now, true) ?? '').replace(/-/g, '').replace(':', '').replace(' ', '_')
  return `${baseName}_${stamp}.csv`
}
