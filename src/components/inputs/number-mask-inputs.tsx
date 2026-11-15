'use client'

import { formatBusinessNumber, formatCorpRegNumber, formatPhone } from '@/lib/format'
import { DigitMaskInput, type DigitMaskInputProps } from './digit-mask-input'

// 번호 입력 부품: 값은 숫자만, 화면은 하이픈 (0029). 검사는 입력 규칙(Zod)에서 한다

// 사업자등록번호 000-00-00000 (권장 span 4)
export function BizNoInput(props: DigitMaskInputProps) {
  return (
    <DigitMaskInput
      placeholder="000-00-00000"
      {...props}
      format={formatBusinessNumber}
      maxDigits={10}
    />
  )
}

// 법인등록번호 000000-0000000 (권장 span 4)
export function CorpRegNoInput(props: DigitMaskInputProps) {
  return (
    <DigitMaskInput
      placeholder="000000-0000000"
      {...props}
      format={formatCorpRegNumber}
      maxDigits={13}
    />
  )
}

// 전화·팩스·휴대폰: 02 / 0xx / 050x / 15xx 자동 하이픈 (권장 span 4)
export function PhoneInput(props: DigitMaskInputProps) {
  return (
    <DigitMaskInput placeholder="010-1234-5678" {...props} format={formatPhone} maxDigits={12} />
  )
}
