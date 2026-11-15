'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/common'
import { useCodeOptions } from '@/components/common-code'
import { codeName } from '@/lib/common-code'
import { formatBusinessNumber, formatPhone } from '@/lib/format'
import { formatDate, formatNumber } from './format'
import type { CellFormat } from './types'

const EMPTY = <span className="text-muted-foreground">-</span>

// 공통코드 값 → 이름 (훅을 쓰므로 따로 부품으로)
function CodeCell({ group, value }: { group: string; value: string }) {
  return <>{codeName(useCodeOptions(group), value)}</>
}

// 소수 자리·단위가 있는 숫자 (금액·무게 등)
function formatDecimal(value: unknown, decimals = 0) {
  const number = Number(value)
  if (value === null || value === undefined || value === '' || Number.isNaN(number)) return null
  return number.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// 셀 서식 적용 (cellType): 값이 없으면 흐린 '-'
// href를 주면 링크로 (코드 → 상세 화면)
export function DataGridCellValue({
  value,
  format = 'text',
  href,
}: {
  value: unknown
  format?: CellFormat
  href?: string
}) {
  if (value === null || value === undefined || value === '') return EMPTY

  let content: React.ReactNode
  if (typeof format === 'object') {
    if ('status' in format) {
      const status = format.status[String(value)]
      // 연결표에 없는 값은 그대로 회색 배지로 보여준다 (누락을 눈에 띄게)
      content = (
        <StatusBadge tone={status?.tone ?? 'neutral'}>{status?.label ?? String(value)}</StatusBadge>
      )
    } else if ('code' in format) {
      content = <CodeCell group={format.code} value={String(value)} />
    } else {
      const text = formatDecimal(value, format.number.decimals)
      if (text === null) return EMPTY
      content = format.number.unit ? `${text} ${format.number.unit}` : text
    }
  } else {
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
      case 'bizNo':
        text = formatBusinessNumber(String(value))
        break
      case 'phone':
        text = formatPhone(String(value))
        break
      case 'yn':
        return value === true || value === 'true' ? (
          <StatusBadge tone="success">예</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">아니오</StatusBadge>
        )
      default:
        text = String(value)
    }
    if (text === null) return EMPTY
    // 긴 글자는 말줄임, 마우스를 올리면 전체 글자 (title)
    content =
      format === 'text' ? (
        <span className="block max-w-80 truncate" title={text}>
          {text}
        </span>
      ) : (
        text
      )
  }

  if (!href) return <>{content}</>
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {content}
    </Link>
  )
}

// 서식에 따른 기본 정렬: 숫자 오른쪽, 코드·날짜·상태·번호·Y/N 가운데, 글자 왼쪽
export function defaultAlign(format: CellFormat | undefined): 'left' | 'center' | 'right' {
  if (format === undefined || format === 'text') return 'left'
  if (format === 'number' || (typeof format === 'object' && 'number' in format)) return 'right'
  return 'center'
}
