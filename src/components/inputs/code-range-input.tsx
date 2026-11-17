'use client'

import { Input } from '@/components/ui/input'

// 코드 범위 입력 (docs/decisions/0075): 시작 ~ 끝. 값은 'A-01~A-03' 한 글자 (목록 검색 조건 값과 같은 모양)
// 한쪽만 넣어도 된다 (시작만 = 그 코드부터, 끝만 = 그 코드까지). 소문자는 대문자로
export function CodeRangeInput({
  value,
  onChange,
  id,
  disabled,
  placeholder = ['시작 코드', '끝 코드'],
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  placeholder?: [string, string]
}) {
  const [from = '', to = ''] = value.split('~')
  // 둘 다 비면 빈 값 (조건 없음)
  const join = (a: string, b: string) => (a || b ? `${a}~${b}` : '')
  const clean = (text: string) => text.toUpperCase().replace(/~/g, '')
  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        aria-label="시작 코드"
        value={from}
        onChange={(e) => onChange(join(clean(e.target.value), to))}
        placeholder={placeholder[0]}
        disabled={disabled}
      />
      <span className="text-muted-foreground" aria-hidden>
        ~
      </span>
      <Input
        aria-label="끝 코드"
        value={to}
        onChange={(e) => onChange(join(from, clean(e.target.value)))}
        placeholder={placeholder[1]}
        disabled={disabled}
      />
    </div>
  )
}
