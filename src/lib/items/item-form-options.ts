import type { UnitTypeValue } from '@/lib/units/unit-labels'
import type { LabelUnitValue } from '@/lib/shippers/shipper-schema'

// 품목 등록·수정 화면의 선택지 모양 (운영사 화면·화주 포털이 같이 쓴다, 0041). 키는 글자
export type ItemShipperOption = {
  id: string
  code: string
  name: string
  // 새 품목에 복사하는 관리 여부 (0083 — 복사 후에는 화주 설정과 무관)
  useLot: boolean
  useExpiry: boolean
  useSerial: boolean
  // 품목이 비워 두면 따르는 값 (화면 안내용)
  allocRule: string
  minInboundShelfDays: number | null
  minOutboundShelfDays: number | null
  labelUnit: LabelUnitValue
}

// 팔레트 종류 선택지 (계산 미리보기에 규격이 필요)
export type ItemPalletOption = {
  code: string
  name: string
  widthCm: string
  depthCm: string
  heightCm: string
  weightKg: string
  maxLoadHeightCm: string | null
  maxLoadWeightKg: string | null
  isActive: boolean
}

export type ItemUnitOption = {
  id: string
  code: string
  name: string
  // 단위 유형 (PACK = 포장 단위 → 환산단위로만, 그 밖의 유형 → 기본단위로만, 0078)
  type: UnitTypeValue
  decimals: number
  isActive: boolean
}

export type ItemFormOptions = {
  shippers: ItemShipperOption[]
  units: ItemUnitOption[]
  pallets: ItemPalletOption[]
  // 운영사 기본 팔레트 (새 품목의 팔레트 종류 기본값)
  defaultPalletType: string
}
