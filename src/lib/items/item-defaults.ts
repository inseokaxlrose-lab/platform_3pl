import type { ShipperItemDefaults } from '@/lib/shippers/shipper-defaults'
import type { UnitLevel } from './item-codes'
import { INHERIT, type ItemCreateInput, type ItemUnitInput } from './item-schema'

// 새 품목의 처음 값 (0083) — 등록 화면·엑셀 업로드·API가 같이 쓴다 (화면·서버 공용, 순수)

// 단위 표 빈 행 (BASE는 환산수량 1)
export const EMPTY_UNIT_ROW = (level: UnitLevel, unitId = ''): ItemUnitInput => ({
  level,
  unitId,
  convQty: level === 'BASE' ? '1' : '',
  widthCm: '',
  depthCm: '',
  heightCm: '',
  grossWeightKg: '',
  netWeightKg: '',
})

// 빈 품목 입력 (화주사·품목코드 제외)
export const EMPTY_ITEM_INPUT: Omit<ItemCreateInput, 'shipperId'> = {
  code: '',
  custCode: '',
  name: '',
  nameEn: '',
  shortName: '',
  spec: '',
  itemType: 'GOODS',
  category1: '',
  category2: '',
  category3: '',
  brandName: '',
  makerName: '',
  originCountry: '',
  hsCode: '',
  itemValue: '',
  currency: '',
  baseUnitId: '',
  defaultInboundUnitId: '',
  defaultOrderUnitId: '',
  units: [EMPTY_UNIT_ROW('BASE')],
  palletTypeCode: '',
  palletTi: null,
  palletHi: null,
  palletBoxQty: null,
  tempZone: 'AMBIENT',
  storageTempMin: '',
  storageTempMax: '',
  hazmat: false,
  fragile: false,
  maxStackBox: null,
  upright: false,
  useExpiry: false,
  expiryType: '',
  expiryInput: '',
  shelfLifeDays: null,
  minInboundShelfDays: null,
  minOutboundShelfDays: null,
  expiryAlertDays: null,
  useLot: false,
  lotSource: '',
  useSerial: false,
  allocRule: INHERIT,
  labelUnit: INHERIT,
  boxOnlyShip: false,
  barcodes: [],
  remark: '',
}

// 화주사 설정을 새 품목에 복사 (기한·LOT·시리얼 — 복사 후에는 화주 설정이 바뀌어도 그대로)
// 관리하면 처음 고르는 값: 기한 = 소비기한·기한일 입력, LOT = 입고 시 입력
export function shipperItemStart(
  shipper: Pick<ShipperItemDefaults, 'useExpiry' | 'useLot' | 'useSerial'>,
) {
  return {
    useExpiry: shipper.useExpiry,
    expiryType: shipper.useExpiry ? 'CONSUME' : '',
    expiryInput: shipper.useExpiry ? 'EXPIRY' : '',
    useLot: shipper.useLot,
    lotSource: shipper.useLot ? 'INPUT' : '',
    useSerial: shipper.useSerial,
  }
}
