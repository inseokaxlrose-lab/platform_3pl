import type { UnitTypeValue } from '@/lib/units/unit-labels'
import type { LabelUnitValue } from '@/lib/shippers/shipper-schema'

// 품목 등록·수정 화면의 선택지 모양 (운영사 화면·화주 포털이 같이 쓴다, 0041). 키는 글자
export type ItemShipperOption = {
  id: string
  code: string
  name: string
  // 품목 기본값 (품목에서 "화주사 기본값 따름"이면 이 값)
  useLot: boolean
  useExpiry: boolean
  labelUnit: LabelUnitValue
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

export type ItemFormOptions = { shippers: ItemShipperOption[]; units: ItemUnitOption[] }
