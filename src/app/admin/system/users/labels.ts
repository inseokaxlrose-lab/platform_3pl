import type { StatusFormat } from '@/components/data-grid'

export const USER_TYPE_LABELS = { OPERATOR: '운영사', CENTER: '센터', SHIPPER: '화주사' } as const
export type UserTypeKey = keyof typeof USER_TYPE_LABELS

export const USER_TYPE_STATUS: StatusFormat = {
  OPERATOR: { label: '운영사', tone: 'info' },
  CENTER: { label: '센터', tone: 'neutral' },
  SHIPPER: { label: '화주사', tone: 'warning' },
}

// 공통 상태 배지 (센터 등 다른 화면과 같은 모양)
export { ACTIVE_STATUS } from '@/components/common/status-formats'
