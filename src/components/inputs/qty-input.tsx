'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatQty } from '@/lib/units/convert'
import { cn } from '@/lib/utils'

// 수량 입력 (재고·입고 수량): 값은 글자 그대로 ('2.5'), Number로 바꾸지 않는다 (0042, CLAUDE.md)
// - decimals: 소수 자리수 (단위의 소수 자리, 기본 0 = 정수) — 넘는 글자는 입력되지 않는다
// - 칸을 떠나면 천 단위 쉼표로 보여 주고, 들어가면 쉼표 없이 고친다
// - allowNegative: 재고 조정처럼 음수가 필요한 곳만
export function QtyInput({
  value,
  onChange,
  decimals = 0,
  allowNegative = false,
  unit,
  className,
  onFocus,
  onBlur,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (value: string) => void
  decimals?: number
  allowNegative?: boolean
  // 오른쪽에 붙는 단위 (예: EA, BOX)
  unit?: string
}) {
  const [focused, setFocused] = useState(false)
  const pattern = new RegExp(
    `^${allowNegative ? '-?' : ''}\\d*${decimals > 0 ? `(\\.\\d{0,${decimals}})?` : ''}$`,
  )
  const shown = (() => {
    if (focused || value === '' || value === '-') return value
    try {
      return formatQty(value)
    } catch {
      return value
    }
  })()

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        className={cn('text-right tabular-nums', unit && 'pr-12', className)}
        value={shown}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onChange={(event) => {
          const raw = event.target.value.replace(/,/g, '')
          if (pattern.test(raw)) onChange(raw)
        }}
        onBlur={(event) => {
          setFocused(false)
          // 끝의 점은 떼어 낸다 ('3.' → '3')
          if (value.endsWith('.')) onChange(value.slice(0, -1))
          onBlur?.(event)
        }}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  )
}
