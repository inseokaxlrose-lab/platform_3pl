import type { StatusFormat } from '@/components/data-grid'

// 창고 유형·보관 조건 이름표 (화면·서버 공용)

export const WAREHOUSE_TYPE_LABELS = {
  GENERAL: '일반',
  INBOUND_STAGING: '입고대기',
  OUTBOUND_STAGING: '출고대기',
  RETURN_STAGING: '반품대기',
} as const
export type WarehouseTypeKey = keyof typeof WAREHOUSE_TYPE_LABELS

// 대기 창고 (0073): 센터 등록 때 자동으로 만드는 입고대기·출고대기·반품대기 — 센터마다 1개씩
// 코드를 바꿀 수 없고, 사용 중지할 수 없고, 로케이션을 더 만들 수 없다 (DEFAULT 하나만 쓴다)
export const STAGING_WAREHOUSE_TYPES = [
  'INBOUND_STAGING',
  'OUTBOUND_STAGING',
  'RETURN_STAGING',
] as const
export const isStagingWarehouse = (type: string) =>
  (STAGING_WAREHOUSE_TYPES as readonly string[]).includes(type)

export const STORAGE_CONDITION_LABELS = {
  AMBIENT: '상온',
  CHILLED: '냉장',
  FROZEN: '냉동',
} as const
export type StorageConditionKey = keyof typeof STORAGE_CONDITION_LABELS
export const STORAGE_CONDITIONS = [
  'AMBIENT',
  'CHILLED',
  'FROZEN',
] as const satisfies readonly StorageConditionKey[]

export const WAREHOUSE_TYPE_STATUS: StatusFormat = {
  GENERAL: { label: '일반', tone: 'neutral' },
  INBOUND_STAGING: { label: '입고대기', tone: 'info' },
  OUTBOUND_STAGING: { label: '출고대기', tone: 'info' },
  RETURN_STAGING: { label: '반품대기', tone: 'info' },
}

export const STORAGE_CONDITION_STATUS: StatusFormat = {
  AMBIENT: { label: '상온', tone: 'neutral' },
  CHILLED: { label: '냉장', tone: 'info' },
  FROZEN: { label: '냉동', tone: 'warning' },
}
