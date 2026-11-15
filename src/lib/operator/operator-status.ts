import { OPERATOR_STATUS } from '@/config/operator-codes'

// 운영사 상태 (값 목록은 src/config/operator-codes.ts, 0039·0040)
// ACTIVE가 아니면 그 운영사의 사용자는 로그인·사용할 수 없다 (플랫폼 관리자는 상관없이 전환해 작업할 수 있다)
export const OPERATOR_STATUSES = OPERATOR_STATUS.values
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number]
export const OPERATOR_STATUS_LABELS = OPERATOR_STATUS.labels

export const isOperatorActive = (status: string | null | undefined) => status === 'ACTIVE'
