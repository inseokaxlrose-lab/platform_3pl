import type { ItemBarcodeInput, ItemInput, ItemUnitInput } from '@/lib/items/item-schema'

// 테스트용 품목 입력 (0083): 화면이 보내는 모양 그대로 — 필요한 칸만 덮어쓴다

// 단위 한 줄 (규격은 비움)
export function unitRow(
  level: ItemUnitInput['level'],
  unitId: bigint | string,
  convQty: string,
  size: Partial<Omit<ItemUnitInput, 'level' | 'unitId' | 'convQty'>> = {},
): ItemUnitInput {
  return {
    level,
    unitId: String(unitId),
    convQty,
    widthCm: '',
    depthCm: '',
    heightCm: '',
    grossWeightKg: '',
    netWeightKg: '',
    ...size,
  }
}

// 바코드 한 줄 (기본 EAN-13, 대표 아님)
export function barcodeRow(
  unitId: bigint | string,
  barcode: string,
  overrides: Partial<ItemBarcodeInput> = {},
): ItemBarcodeInput {
  return { unitId: String(unitId), barcode, barcodeType: 'EAN13', isPrimary: false, ...overrides }
}

// 기본 입력: 기본단위 행만 있는 일반 상온 품목, 기한·LOT 안 씀
export function itemInput(
  baseUnitId: bigint | string,
  overrides: Partial<ItemInput> = {},
): ItemInput {
  return {
    name: '생수 500ml',
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
    baseUnitId: String(baseUnitId),
    defaultInboundUnitId: '',
    defaultOrderUnitId: '',
    units: [unitRow('BASE', baseUnitId, '1')],
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
    allocRule: '',
    labelUnit: '',
    boxOnlyShip: false,
    barcodes: [],
    remark: '',
    ...overrides,
  }
}

// 기한 관리 켜기 (유통기한, 유통기한 직접 입력, 임박 30일)
export const withExpiry: Partial<ItemInput> = {
  useExpiry: true,
  expiryType: 'SELL',
  expiryInput: 'EXPIRY',
  expiryAlertDays: 30,
}

// LOT 관리 켜기 (입고 시 입력)
export const withLot: Partial<ItemInput> = { useLot: true, lotSource: 'INPUT' }

// DB에 바로 넣는 품목(prisma.item.create)의 LOT·기한 관리 칸 — DB 검사 조건상 종류·방식까지 함께 (0083)
export const MILK_OPTIONS = {
  useLot: 'Y',
  useExpiry: 'Y',
  expiryType: 'SELL',
  expiryInput: 'EXPIRY',
  lotSource: 'INPUT',
} as const
