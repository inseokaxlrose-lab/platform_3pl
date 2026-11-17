import type { StatusFormat } from '@/components/data-grid'

// 단위 유형 (화면·서버 공용, docs/decisions/0034·0078)
// 프로그램이 유형에 따라 환산·입력을 다르게 하므로 공통코드가 아닌 enum (0030)
export const UNIT_TYPES = ['QTY', 'PACK', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA'] as const
export type UnitTypeValue = (typeof UNIT_TYPES)[number]

export const UNIT_TYPE_LABELS: Record<UnitTypeValue, string> = {
  QTY: '수량',
  PACK: '포장',
  WEIGHT: '중량',
  VOLUME: '부피',
  LENGTH: '길이',
  AREA: '면적',
}

// 물리 단위: 유형 기준단위 × 환산계수로 서로 바꿀 수 있는 유형
export const PHYSICAL_UNIT_TYPES = ['WEIGHT', 'VOLUME', 'LENGTH', 'AREA'] as const
export const isPhysicalType = (type: string) =>
  (PHYSICAL_UNIT_TYPES as readonly string[]).includes(type)

// 품목 기본단위(재고를 세는 단위)로 고를 수 있는 유형: 포장 단위가 아닌 것
export const ITEM_BASE_UNIT_TYPES = ['QTY', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA'] as const
export const isItemBaseType = (type: string) => type !== 'PACK'

export const UNIT_TYPE_STATUS: StatusFormat = {
  QTY: { label: UNIT_TYPE_LABELS.QTY, tone: 'info' },
  PACK: { label: UNIT_TYPE_LABELS.PACK, tone: 'neutral' },
  WEIGHT: { label: UNIT_TYPE_LABELS.WEIGHT, tone: 'success' },
  VOLUME: { label: UNIT_TYPE_LABELS.VOLUME, tone: 'success' },
  LENGTH: { label: UNIT_TYPE_LABELS.LENGTH, tone: 'success' },
  AREA: { label: UNIT_TYPE_LABELS.AREA, tone: 'success' },
}

// 단위 고르기 표시: "BOX · 박스"
export const unitOptionLabel = (unit: { code: string; name: string }) =>
  `${unit.code} · ${unit.name}`
