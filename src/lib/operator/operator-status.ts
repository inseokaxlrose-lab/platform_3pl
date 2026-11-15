// 운영사 상태 (공통코드 OPERATOR_STATUS, docs/specs/operator.md, 0039)
// ACTIVE가 아니면 그 운영사의 사용자는 로그인·사용할 수 없다 (플랫폼 관리자는 상관없이 전환해 작업할 수 있다)
export const OPERATOR_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED'] as const
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number]

export const OPERATOR_STATUS_LABELS: Record<OperatorStatus, string> = {
  PENDING: '대기',
  ACTIVE: '운영',
  SUSPENDED: '정지',
  TERMINATED: '해지',
}

export const isOperatorActive = (status: string | null | undefined) => status === 'ACTIVE'
