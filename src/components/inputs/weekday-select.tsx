'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

// 자주 쓰는 묶음
const PRESETS = [
  { label: '평일', value: 'YYYYYNN' },
  { label: '매일', value: 'YYYYYYY' },
] as const

// 요일 고르기 (운영 요일 등, 권장 span 6). 값은 월~일 7글자 'Y'/'N' (예: 'YYYYYNN' = 평일)
// 요일 버튼을 눌러 켜고 끄며, [평일]·[매일]로 한 번에 고를 수 있다
export function WeekdaySelect({
  value,
  onChange,
  id,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
}) {
  const days = value.padEnd(7, 'N').slice(0, 7)
  // i번째 요일 켜기/끄기
  const toggle = (index: number) =>
    onChange(
      days
        .split('')
        .map((d, i) => (i === index ? (d === 'Y' ? 'N' : 'Y') : d))
        .join(''),
    )

  return (
    <div id={id} role="group" className="flex flex-wrap items-center gap-1.5">
      {DAYS.map((label, index) => {
        const on = days[index] === 'Y'
        return (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={on ? 'default' : 'outline'}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(index)}
            className={cn('w-9 px-0', !on && index >= 5 && 'text-destructive')}
          >
            {label}
          </Button>
        )
      })}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {PRESETS.map((preset) => (
        <Button
          key={preset.value}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange(preset.value)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}
