import type { StatusFormat } from '@/components/data-grid'

// 권한그룹 영역 표시
export const AREA_LABELS = { ADMIN: '운영사 화면', PORTAL: '화주 포털' } as const

export const AREA_STATUS: StatusFormat = {
  ADMIN: { label: AREA_LABELS.ADMIN, tone: 'info' },
  PORTAL: { label: AREA_LABELS.PORTAL, tone: 'neutral' },
}
