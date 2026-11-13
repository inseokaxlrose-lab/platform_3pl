import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 상태 색은 화면에서 직접 고르지 않고 "톤"으로만 지정한다
// 업무 상태 ↔ 톤 연결표(예: 입고 예정 → info)는 상태 값이 생기는 M5에서 만든다
export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

const TONE_TO_VARIANT = {
  neutral: 'secondary',
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'destructive',
} as const

type StatusBadgeProps = {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}

// 상태 배지: 앞쪽 점(●)으로 "상태"임을 표시한다
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <Badge variant={TONE_TO_VARIANT[tone]} className={cn('gap-1.5', className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  )
}
