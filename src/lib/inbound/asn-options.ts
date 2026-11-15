// ASN 등록·수정 화면의 선택지 모양 (운영사 화면·화주 포털 공용, 키는 글자)

export type AsnCenterOption = { id: string; code: string; name: string }

export type AsnShipperOption = {
  id: string
  code: string
  name: string
  // 이 화주사가 이용하는 센터 중 사용자 범위 안의 것
  centerIds: string[]
}

export type AsnItemUnitOption = { code: string; convQty: string; decimals: number }

export type AsnItemOption = {
  id: string
  code: string
  name: string
  spec: string | null
  barcode: string | null
  baseUnit: { code: string; decimals: number }
  // 환산단위 (BOX 24 …)
  units: AsnItemUnitOption[]
  useLot: boolean
  useExpiry: boolean
}

export type AsnFormOptions = {
  centers: AsnCenterOption[]
  shippers: AsnShipperOption[]
}
