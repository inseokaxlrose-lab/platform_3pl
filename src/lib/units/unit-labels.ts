import type { StatusFormat } from '@/components/data-grid'

// 단위 종류 이름표 (화면·서버 공용, docs/decisions/0034)
export const UNIT_KINDS = ['BASE', 'PACK'] as const
export type UnitKindValue = (typeof UNIT_KINDS)[number]

export const UNIT_KIND_LABELS: Record<UnitKindValue, string> = {
  BASE: '기본단위',
  PACK: '환산단위',
}

export const UNIT_KIND_STATUS: StatusFormat = {
  BASE: { label: UNIT_KIND_LABELS.BASE, tone: 'info' },
  PACK: { label: UNIT_KIND_LABELS.PACK, tone: 'neutral' },
}
