import type { StatusFormat } from '@/components/data-grid'

export const USER_TYPE_LABELS = { OPERATOR: '운영사', CENTER: '센터', SHIPPER: '화주사' } as const
export type UserTypeKey = keyof typeof USER_TYPE_LABELS

export const USER_TYPE_STATUS: StatusFormat = {
  OPERATOR: { label: '운영사', tone: 'info' },
  CENTER: { label: '센터', tone: 'neutral' },
  SHIPPER: { label: '화주사', tone: 'warning' },
}

export const ACTIVE_STATUS: StatusFormat = {
  true: { label: '사용', tone: 'success' },
  false: { label: '사용 중지', tone: 'danger' },
}
