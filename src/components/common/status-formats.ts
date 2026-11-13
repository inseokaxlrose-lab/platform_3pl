import type { StatusFormat } from '@/components/data-grid'

// 여러 화면이 같이 쓰는 상태 배지 모양
export const ACTIVE_STATUS: StatusFormat = {
  true: { label: '사용', tone: 'success' },
  false: { label: '사용 중지', tone: 'danger' },
}
