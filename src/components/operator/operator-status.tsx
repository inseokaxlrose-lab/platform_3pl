import { StatusBadge, type StatusTone } from '@/components/common'
import type { StatusFormat } from '@/components/data-grid'
import { OPERATOR_STATUS } from '@/config/operator-codes'

// 운영 상태 배지 색: 운영 = 초록, 가입대기 = 파랑, 일시정지 = 주황, 해지 = 빨강 (0040)
const TONES: Record<(typeof OPERATOR_STATUS.values)[number], StatusTone> = {
  PENDING: 'info',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
}

const toneOf = (status: string): StatusTone =>
  OPERATOR_STATUS.has(status) ? TONES[status] : 'neutral'

// 목록 칸 서식 (DataGrid format.status)
export const OPERATOR_STATUS_FORMAT: StatusFormat = Object.fromEntries(
  OPERATOR_STATUS.values.map((s) => [s, { label: OPERATOR_STATUS.labels[s], tone: TONES[s] }]),
)

// 편집 화면 헤더용 배지 (정지·해지면 사유를 옆에)
export function OperatorStatusBadge({
  status,
  reason,
}: {
  status: string
  reason?: string | null
}) {
  const label = OPERATOR_STATUS.has(status) ? OPERATOR_STATUS.labels[status] : status
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge tone={toneOf(status)}>{label}</StatusBadge>
      {reason && <span className="text-xs text-muted-foreground">사유: {reason}</span>}
    </span>
  )
}
