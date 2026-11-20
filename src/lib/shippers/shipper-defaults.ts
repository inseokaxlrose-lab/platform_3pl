import { toValue } from '@/lib/db-value'
import { isYes } from '@/lib/yn'
import { LABEL_UNITS, type LabelUnitValue } from './shipper-schema'

// 화주사의 품목 기본값 (0003 결정 2, 0080) — 화면 조회·서버 공용
// 로트·유통기한 관리: 화주사가 비워 두면(NULL) 운영사 값을 따른다
//   품목에 적용되는 값 = 품목 값 ?? 화주사 값 ?? 운영사 값
// 품목은 센터에 묶이지 않으므로 센터 단계는 건너뛴다 (센터별 업무 설정은 getEffectiveSetting)

// select에 넣는 칸: shipper: { select: shipperDefaultsSelect }
export const shipperDefaultsSelect = {
  useLot: true,
  useExpiry: true,
  useSerial: true,
  allocRule: true,
  minInboundShelfDays: true,
  minOutboundShelfDays: true,
  labelUnit: true,
  operator: { select: { useLot: true, useExpiry: true, useSerial: true, allocRule: true } },
} as const

export type ShipperDefaultsRow = {
  useLot: string | null
  useExpiry: string | null
  useSerial: string | null
  allocRule: string | null
  minInboundShelfDays: number | null
  minOutboundShelfDays: number | null
  // DB 값 목록 칸 (CHECK) — 아래에서 정해진 값으로 좁힌다
  labelUnit: string
  operator: { useLot: string; useExpiry: string; useSerial: string; allocRule: string }
}

// 품목 기본값: 새 품목에 복사하는 관리 여부(기한·LOT·시리얼, 0083 — 복사 후에는 화주 설정과 무관) +
// 품목이 비워 두면 따르는 값(할당 규칙·최소 잔여일·라벨 단위)
export type ShipperItemDefaults = {
  useLot: boolean
  useExpiry: boolean
  useSerial: boolean
  allocRule: string
  minInboundShelfDays: number | null
  minOutboundShelfDays: number | null
  labelUnit: LabelUnitValue
}

// 조회한 화주사 → 품목 기본값 (true/false)
export function shipperItemDefaults(shipper: ShipperDefaultsRow): ShipperItemDefaults {
  return {
    useLot: isYes(shipper.useLot ?? shipper.operator.useLot),
    useExpiry: isYes(shipper.useExpiry ?? shipper.operator.useExpiry),
    useSerial: isYes(shipper.useSerial ?? shipper.operator.useSerial),
    allocRule: shipper.allocRule ?? shipper.operator.allocRule,
    minInboundShelfDays: shipper.minInboundShelfDays,
    minOutboundShelfDays: shipper.minOutboundShelfDays,
    labelUnit: toValue(LABEL_UNITS, shipper.labelUnit),
  }
}
