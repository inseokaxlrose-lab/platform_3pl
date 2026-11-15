'use client'

import { useLayoutEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { digitsOnly } from '@/lib/format'

export type DigitMaskInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  // 숫자만 (저장 형식, 0029). 화면에는 format으로 하이픈을 붙여 보여준다
  value: string
  onChange: (digits: string) => void
}

// 숫자 마스크 입력의 바탕 (사업자번호·법인번호·전화번호가 이걸로 만든다)
// - 입력하는 대로 하이픈을 붙여 보여주고, 바깥에는 숫자만 알려준다
// - 하이픈이 끼어들어도 커서가 끝으로 튀지 않게, "커서 앞 숫자 개수"를 기준으로 제자리에 둔다
export function DigitMaskInput({
  value,
  onChange,
  format,
  maxDigits,
  ...props
}: DigitMaskInputProps & {
  format: (digits: string) => string
  maxDigits: number
}) {
  const ref = useRef<HTMLInputElement>(null)
  // 다음 그리기 후 커서를 둘 위치 = 커서 앞 숫자 개수
  const caretDigits = useRef<number | null>(null)

  useLayoutEffect(() => {
    const input = ref.current
    if (!input || caretDigits.current === null || document.activeElement !== input) return
    let seen = 0
    let position = 0
    while (position < input.value.length && seen < caretDigits.current) {
      if (/\d/.test(input.value[position])) seen++
      position++
    }
    input.setSelectionRange(position, position)
    caretDigits.current = null
  })

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={format(value)}
      onChange={(event) => {
        const raw = event.target.value
        const caret = event.target.selectionStart ?? raw.length
        caretDigits.current = digitsOnly(raw.slice(0, caret)).length
        onChange(digitsOnly(raw).slice(0, maxDigits))
      }}
    />
  )
}
