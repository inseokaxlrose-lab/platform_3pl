import { Input } from '@/components/ui/input'

// 날짜 입력: 브라우저 기본 날짜 칸 (새 라이브러리 없이). 값은 'YYYY-MM-DD', 비어 있으면 '' (권장 span 3~4)
// 달력 팝업 디자인이 필요해지면 shadcn calendar(react-day-picker)로 바꾼다 — 바깥 사용법은 그대로
export function DateInput({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (value: string) => void
}) {
  return <Input {...props} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
}

export type DateRange = { from: string; to: string }

// 기간 입력 (시작 ~ 종료, 권장 span 6~8): 종료일은 시작일보다 앞을 고를 수 없게 막는다
// 두 날짜의 앞뒤 검사는 입력 규칙(Zod)에서도 한다
export function DateRangeInput({
  value,
  onChange,
  id,
  disabled,
  invalid,
}: {
  value: DateRange
  onChange: (value: DateRange) => void
  // 시작 칸 id (이름표 연결용). 종료 칸은 `${id}-to`
  id?: string
  disabled?: boolean
  invalid?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <DateInput
        id={id}
        aria-label="시작일"
        value={value.from}
        max={value.to || undefined}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(from) => onChange({ ...value, from })}
      />
      <span className="text-muted-foreground">~</span>
      <DateInput
        id={id && `${id}-to`}
        aria-label="종료일"
        value={value.to}
        min={value.from || undefined}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(to) => onChange({ ...value, to })}
      />
    </div>
  )
}
