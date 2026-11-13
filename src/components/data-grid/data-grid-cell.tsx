import { StatusBadge } from '@/components/common'
import { formatDate, formatNumber } from './format'
import type { CellFormat } from './types'

// 셀 서식 적용: 값이 없으면 흐린 '-'
export function DataGridCellValue({
  value,
  format = 'text',
}: {
  value: unknown
  format?: CellFormat
}) {
  const empty = <span className="text-muted-foreground">-</span>

  if (typeof format === 'object') {
    if (value === null || value === undefined) return empty
    const status = format.status[String(value)]
    // 연결표에 없는 값은 그대로 회색 배지로 보여준다 (누락을 눈에 띄게)
    return status ? (
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    ) : (
      <StatusBadge tone="neutral">{String(value)}</StatusBadge>
    )
  }

  let text: string | null
  switch (format) {
    case 'number':
      text = formatNumber(value)
      break
    case 'date':
      text = formatDate(value)
      break
    case 'datetime':
      text = formatDate(value, true)
      break
    default:
      text = value === null || value === undefined || value === '' ? null : String(value)
  }
  return text === null ? empty : <>{text}</>
}

// 서식에 따른 기본 정렬: 숫자는 오른쪽
export function defaultAlign(format: CellFormat | undefined) {
  return format === 'number' ? 'right' : 'left'
}
