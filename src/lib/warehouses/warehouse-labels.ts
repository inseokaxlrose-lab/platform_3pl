import type { StatusFormat } from '@/components/data-grid'

// 창고 유형·보관 조건 이름표 (화면·서버 공용)

export const WAREHOUSE_TYPE_LABELS = { GENERAL: '일반', INBOUND_STAGING: '입고대기' } as const
export type WarehouseTypeKey = keyof typeof WAREHOUSE_TYPE_LABELS

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
}

export const STORAGE_CONDITION_STATUS: StatusFormat = {
  AMBIENT: { label: '상온', tone: 'neutral' },
  CHILLED: { label: '냉장', tone: 'info' },
  FROZEN: { label: '냉동', tone: 'warning' },
}
