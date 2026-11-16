'use client'

import { DigitMaskInput, type DigitMaskInputProps } from './digit-mask-input'

// 'HHMM' 숫자 → 화면 'HH:MM' (입력 중이면 '09', '09:3'처럼 있는 만큼)
export const formatTimeDigits = (digits: string) =>
  digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}` : digits

// 시각 입력 (24시간, 권장 span 2~3). 값은 'HH:MM' 글자 — 빈 값은 '' (0073)
// 숫자만 치면 콜론을 자동으로 붙인다 (0930 → 09:30). 범위 검사는 입력 규칙 optionalTime에서
export function TimeInput({ value, onChange, ...props }: DigitMaskInputProps) {
  return (
    <DigitMaskInput
      placeholder="00:00"
      {...props}
      value={value.replace(':', '')}
      onChange={(digits) => onChange(formatTimeDigits(digits))}
      format={formatTimeDigits}
      maxDigits={4}
    />
  )
}
