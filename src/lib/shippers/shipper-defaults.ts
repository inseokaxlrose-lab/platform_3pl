import { isYes } from '@/lib/yn'

// 화주사의 품목 기본값 (0003 결정 2, 0080) — 화면 조회·서버 공용
// 로트·유통기한 관리: 화주사가 비워 두면(NULL) 운영사 값을 따른다
//   품목에 적용되는 값 = 품목 값 ?? 화주사 값 ?? 운영사 값
// 품목은 센터에 묶이지 않으므로 센터 단계는 건너뛴다 (센터별 업무 설정은 getEffectiveSetting)

// select에 넣는 칸: shipper: { select: shipperDefaultsSelect }
export const shipperDefaultsSelect = {
  useLot: true,
  useExpiry: true,
  labelUnit: true,
  operator: { select: { useLot: true, useExpiry: true } },
} as const

export type ShipperDefaultsRow = {
  useLot: string | null
  useExpiry: string | null
  labelUnit: 'PLT' | 'BOX'
  operator: { useLot: string; useExpiry: string }
}

export type ShipperItemDefaults = { useLot: boolean; useExpiry: boolean; labelUnit: 'PLT' | 'BOX' }

// 조회한 화주사 → 품목 기본값 (true/false)
export function shipperItemDefaults(shipper: ShipperDefaultsRow): ShipperItemDefaults {
  return {
    useLot: isYes(shipper.useLot ?? shipper.operator.useLot),
    useExpiry: isYes(shipper.useExpiry ?? shipper.operator.useExpiry),
    labelUnit: shipper.labelUnit,
  }
}
