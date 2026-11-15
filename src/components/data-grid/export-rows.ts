import { codeName, type CodeOptions } from '@/lib/common-code'
import { formatBusinessNumber, formatPhone } from '@/lib/format'
import { formatDate } from './format'
import type { DataGridColumn } from './types'

// 엑셀 내보내기용 값 만들기 (순수 함수 — 파일 만들기는 export-xlsx.ts)
// 화면에 보이는 컬럼·순서 그대로, 제목은 한글 이름, 코드·상태는 이름으로 바꾼다

export type ExportCell = string | number | null
export type ExportSheet = { header: string[]; rows: ExportCell[][] }

// 행에서 컬럼 값 꺼내기
function readValue<TData>(column: DataGridColumn<TData>, row: TData): unknown {
  return typeof column.accessor === 'function'
    ? column.accessor(row)
    : (row as Record<string, unknown>)[column.accessor]
}

const NUMERIC = /^-?\d+(\.\d+)?$/

// 셀 하나 → 엑셀 값
// - 숫자: 숫자 그대로 (엑셀에서 계산 가능, 쉼표는 엑셀 서식으로)
// - 날짜: 화면과 같은 한국 시간 글자 / 상태·코드: 이름 / 번호: 하이픈 / Y/N: 예·아니오
export function toExportCell<TData>(
  column: DataGridColumn<TData>,
  row: TData,
  codes: CodeOptions = {},
): ExportCell {
  const value = readValue(column, row)
  if (value === null || value === undefined || value === '') return null
  const format = column.format ?? 'text'

  if (typeof format === 'object') {
    if ('status' in format) return format.status[String(value)]?.label ?? String(value)
    if ('code' in format) return codeName(codes[format.code], String(value))
    // { number }: 숫자로
    return NUMERIC.test(String(value).trim()) ? Number(value) : String(value)
  }
  switch (format) {
    case 'number':
      return NUMERIC.test(String(value).trim()) ? Number(value) : String(value)
    case 'date':
      return formatDate(value)
    case 'datetime':
      return formatDate(value, true)
    case 'bizNo':
      return formatBusinessNumber(String(value))
    case 'phone':
      return formatPhone(String(value))
    case 'yn':
      return value === true || value === 'true' ? '예' : '아니오'
    default:
      return String(value)
  }
}

// 컬럼(보이는 순서) + 행 → 시트 (첫 줄은 컬럼 제목)
export function toExportSheet<TData>(
  columns: DataGridColumn<TData>[],
  rows: TData[],
  codes: CodeOptions = {},
): ExportSheet {
  return {
    header: columns.map((column) => column.header),
    rows: rows.map((row) => columns.map((column) => toExportCell(column, row, codes))),
  }
}

// 파일 이름: 센터_20261113_1405.xlsx (한국 시간 기준)
export function exportFileName(baseName: string, now: Date = new Date()) {
  const stamp = (formatDate(now, true) ?? '').replace(/-/g, '').replace(':', '').replace(' ', '_')
  return `${baseName}_${stamp}.xlsx`
}
