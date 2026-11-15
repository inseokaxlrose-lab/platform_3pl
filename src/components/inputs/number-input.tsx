'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type NumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
> & {
  // 비어 있으면 null
  value: number | null
  onChange: (value: number | null) => void
  // 소수점 자리수 (기본 0 = 정수)
  decimals?: number
  min?: number
  max?: number
  // 오른쪽에 붙는 단위 (예: kg, cm, 개)
  unit?: string
}

const groupThousands = (integer: string) => integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// 입력 중인 글자 → 쉼표 넣은 모양 (소수점·끝의 0은 입력한 그대로 둔다)
function formatTyping(text: string) {
  const negative = text.startsWith('-')
  const [integer, fraction] = text.replace('-', '').split('.')
  return `${negative ? '-' : ''}${groupThousands(integer)}${fraction !== undefined ? `.${fraction}` : ''}`
}

// 저장된 값 → 보여줄 글자 (소수점 자리수를 고정해서: 1.5 → '1.50')
const toText = (value: number | null, decimals: number) =>
  value === null ? '' : formatTyping(value.toFixed(decimals))

// 숫자 입력 (span은 호출 측에서): 천 단위 쉼표, 소수점 자리수 제한, 최소·최대(칸을 떠날 때 맞춤), 단위 표시
export function NumberInput({
  value,
  onChange,
  decimals = 0,
  min,
  max,
  unit,
  className,
  onBlur,
  onFocus,
  ...props
}: NumberInputProps) {
  // 입력 중에는 사용자가 친 글자(예: '1,2' '3.')를 그대로 두고, 바깥 값이 바뀌면 다시 그린다
  const [typing, setTyping] = useState<string | null>(null)
  const allowNegative = min === undefined || min < 0
  const pattern = new RegExp(
    `^${allowNegative ? '-?' : ''}\\d*${decimals > 0 ? `(\\.\\d{0,${decimals}})?` : ''}$`,
  )

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        className={cn('text-right tabular-nums', unit && 'pr-10', className)}
        value={typing ?? toText(value, decimals)}
        onFocus={(event) => {
          setTyping(toText(value, decimals))
          onFocus?.(event)
        }}
        onChange={(event) => {
          const raw = event.target.value.replace(/,/g, '')
          // 허용하지 않는 글자(문자, 자리수 초과)는 입력되지 않게 무시
          if (!pattern.test(raw)) return
          setTyping(formatTyping(raw))
          const parsed = raw === '' || raw === '-' || raw === '.' ? null : Number(raw)
          onChange(parsed === null || Number.isNaN(parsed) ? null : parsed)
        }}
        onBlur={(event) => {
          // 칸을 떠날 때 최소·최대 범위로 맞춘다
          if (value !== null) {
            const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value))
            if (clamped !== value) onChange(clamped)
          }
          setTyping(null)
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
