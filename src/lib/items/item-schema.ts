import { z } from 'zod'
import { ALLOC_RULE, TEMP_ZONE } from '@/config/operator-codes'
import { idField, optionalIdSchema } from '@/lib/id'
import { LABEL_UNITS, type LabelUnitValue } from '@/lib/shippers/shipper-schema'
import { oneOf, optionalDecimal, optionalText, requiredText } from '@/lib/validation/common-fields'
import {
  BARCODE_TYPE,
  EXPIRY_INPUT,
  EXPIRY_TYPE,
  ITEM_TYPE,
  LOT_SOURCE,
  UNIT_LEVEL,
} from './item-codes'

// 품목 입력 규칙 — 화면·서버 공용 (docs/decisions/0041, 0083)
// 숫자 중 소수(환산수량·규격·중량·가액)는 글자로, 정수(일수·TI·HI)는 숫자로 주고받는다

// 바코드는 한 품목에 몇 개까지
export const MAX_ITEM_BARCODES = 50

// 라벨 단위·할당 규칙: '' = 화주사 값 따름 (상속, DB null)
export const INHERIT = ''

// 품목코드: 화주 코드 그대로 — 영문·숫자·점·하이픈·밑줄 1~50자 (소문자는 대문자로), 필수, 등록 후 변경 불가 (0083)
export const itemCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, '품목코드를 입력해 주세요.')
  .max(50, '50자 이하로 입력해 주세요.')
  .regex(/^[A-Z0-9._-]+$/, '품목코드는 영문·숫자·점·하이픈·밑줄입니다.')

// 0보다 큰 소수 글자 (환산수량: 소수 자리는 서버가 기본단위 기준으로 확인)
const positiveQty = (message: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/,/g, ''))
    .refine((value) => /^\d+(\.\d+)?$/.test(value) && Number(value) > 0, message)

// 선택 양수 정수 (일수·TI·HI·적층)
const optionalInt = (min: number, max: number) =>
  z
    .number()
    .int('정수로 입력해 주세요.')
    .min(min, `${min} 이상입니다.`)
    .max(max, `${max} 이하입니다.`)
    .nullable()

// 온도 (음수 허용, 소수 1자리)
const optionalTemp = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^-?\d{1,3}(\.\d)?$/.test(value),
    '온도는 -999.9~999.9, 소수 1자리입니다.',
  )
  .transform((value) => value || null)

// ── 품목 단위 한 줄 (레벨별 1행, BASE 행은 기본단위·환산수량 1)
export const itemUnitSchema = z.object({
  level: oneOf(UNIT_LEVEL.values, '단위 레벨을 골라 주세요.'),
  unitId: idField('단위를 골라 주세요.'),
  convQty: positiveQty('환산수량을 0보다 크게 입력해 주세요.'),
  // 규격 (cm·kg, 비워도 저장 — BOX가 비면 "체적 미등록")
  widthCm: optionalDecimal(8, 2),
  depthCm: optionalDecimal(8, 2),
  heightCm: optionalDecimal(8, 2),
  grossWeightKg: optionalDecimal(10, 3),
  netWeightKg: optionalDecimal(10, 3),
})

// ── 바코드 한 줄
export const itemBarcodeSchema = z.object({
  unitId: idField('바코드의 단위를 골라 주세요.'),
  barcode: z
    .string()
    .trim()
    .min(1, '바코드를 입력해 주세요.')
    .max(50, '50자 이하로 입력해 주세요.'),
  barcodeType: oneOf(BARCODE_TYPE.values, '바코드 종류를 골라 주세요.'),
  isPrimary: z.boolean(),
})

const itemShape = {
  // ① 기본 정보
  name: requiredText('품목명을 입력해 주세요.', 200),
  nameEn: optionalText(200),
  shortName: optionalText(50),
  spec: optionalText(100),
  itemType: oneOf(ITEM_TYPE.values, '품목 유형을 골라 주세요.'),
  category1: optionalText(50),
  category2: optionalText(50),
  category3: optionalText(50),
  brandName: optionalText(100),
  makerName: optionalText(100),
  originCountry: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === '' || /^[A-Z]{2}$/.test(value),
      '원산지는 국가코드 두 글자입니다 (예: KR).',
    )
    .transform((value) => value || null),
  hsCode: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^[0-9.]{4,12}$/.test(value),
      'HS 코드는 숫자 4~12자리입니다.',
    )
    .transform((value) => value || null),
  itemValue: optionalDecimal(15, 2),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === '' || /^[A-Z]{3}$/.test(value),
      '통화는 세 글자 코드입니다 (예: KRW).',
    )
    .transform((value) => value || null),
  // ② 단위 (기본 입고·주문단위를 비우면 서버가 BOX·기본단위로)
  baseUnitId: idField('기본단위를 골라 주세요.'),
  defaultInboundUnitId: optionalIdSchema.default(null),
  defaultOrderUnitId: optionalIdSchema.default(null),
  units: z.array(itemUnitSchema).max(4, '단위는 레벨별 1개, 4개까지입니다.'),
  // ③ 팔레트 적재
  palletTypeCode: z
    .string()
    .trim()
    .max(20)
    .transform((value) => value || null),
  palletTi: optionalInt(1, 999),
  palletHi: optionalInt(1, 999),
  palletBoxQty: optionalInt(1, 99999),
  // ④ 보관 조건
  tempZone: oneOf(TEMP_ZONE.values, '보관 온도대를 골라 주세요.'),
  storageTempMin: optionalTemp,
  storageTempMax: optionalTemp,
  hazmat: z.boolean(),
  fragile: z.boolean(),
  maxStackBox: optionalInt(1, 999),
  upright: z.boolean(),
  // ⑤ 소비기한·LOT (관리 여부는 명시값)
  useExpiry: z.boolean(),
  expiryType: z.string().transform((value) => value || null),
  expiryInput: z.string().transform((value) => value || null),
  shelfLifeDays: optionalInt(1, 36500),
  minInboundShelfDays: optionalInt(0, 36500),
  minOutboundShelfDays: optionalInt(0, 36500),
  expiryAlertDays: optionalInt(1, 3650),
  useLot: z.boolean(),
  lotSource: z.string().transform((value) => value || null),
  useSerial: z.boolean(),
  allocRule: z.enum([INHERIT, ...ALLOC_RULE.values], '골라 주세요.'),
  labelUnit: z.enum([INHERIT, ...LABEL_UNITS], '골라 주세요.'),
  // ⑥ 출고 조건
  boxOnlyShip: z.boolean(),
  // 바코드
  barcodes: z
    .array(itemBarcodeSchema)
    .max(MAX_ITEM_BARCODES, `바코드는 ${MAX_ITEM_BARCODES}개까지입니다.`),
  remark: optionalText(1000),
}

type ItemShapeOut = z.output<z.ZodObject<typeof itemShape>>

// 칸 사이 규칙 (조건부 필수·단위 레벨·바코드) — 화면 즉시 검사와 서버가 같이 쓴다
function crossRules(value: ItemShapeOut, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message })
  if (value.useExpiry) {
    if (
      !value.expiryType ||
      !(EXPIRY_TYPE.values as readonly string[]).includes(value.expiryType)
    ) {
      issue(['expiryType'], '기한 관리 품목은 기한 종류를 골라 주세요.')
    }
    if (
      !value.expiryInput ||
      !(EXPIRY_INPUT.values as readonly string[]).includes(value.expiryInput)
    ) {
      issue(['expiryInput'], '기한 관리 품목은 기한 입력 방식을 골라 주세요.')
    }
    if (
      (value.expiryInput === 'MFG' || value.expiryInput === 'BOTH') &&
      value.shelfLifeDays === null
    ) {
      issue(['shelfLifeDays'], '제조일로 기한을 계산하려면 총 기한 일수가 필요합니다.')
    }
  }
  if (
    value.useLot &&
    (!value.lotSource || !(LOT_SOURCE.values as readonly string[]).includes(value.lotSource))
  ) {
    issue(['lotSource'], 'LOT 관리 품목은 LOT 생성 방식을 골라 주세요.')
  }
  if (
    value.storageTempMin !== null &&
    value.storageTempMax !== null &&
    Number(value.storageTempMin) > Number(value.storageTempMax)
  ) {
    issue(['storageTempMax'], '최고온도는 최저온도보다 높아야 합니다.')
  }
  // 단위: BASE 1행 필수, 레벨별 1행, BASE 행 = 기본단위·환산수량 1, 같은 단위를 두 레벨에 쓸 수 없음
  const levels = value.units.map((u) => u.level)
  const base = value.units.find((u) => u.level === 'BASE')
  if (!base) issue(['units'], '기본단위 행이 필요합니다.')
  else {
    if (base.unitId !== value.baseUnitId)
      issue(['units'], '기본단위 행의 단위는 기본단위와 같아야 합니다.')
    if (Number(base.convQty) !== 1) issue(['units'], '기본단위 행의 환산수량은 1입니다.')
  }
  value.units.forEach((u, index) => {
    if (levels.indexOf(u.level) !== index)
      issue(['units', index, 'level'], `${u.level} 단위가 두 번 있습니다.`)
    if (value.units.findIndex((x) => x.unitId === u.unitId) !== index) {
      issue(['units', index, 'unitId'], '같은 단위를 두 레벨에 쓸 수 없습니다.')
    }
  })
  // 바코드: 품목 안에서 겹치지 않음, 단위는 품목 단위 중에서, 대표는 단위별 1개
  const unitIds = new Set(value.units.map((u) => u.unitId))
  value.barcodes.forEach((b, index) => {
    if (value.barcodes.findIndex((x) => x.barcode === b.barcode) !== index) {
      issue(['barcodes', index, 'barcode'], '같은 바코드가 두 번 있습니다.')
    }
    if (!unitIds.has(b.unitId)) issue(['barcodes', index, 'unitId'], '이 품목의 단위가 아닙니다.')
  })
  for (const unitId of unitIds) {
    if (value.barcodes.filter((b) => b.unitId === unitId && b.isPrimary).length > 1) {
      issue(['barcodes'], '대표 바코드는 단위별 1개입니다.')
    }
  }
}

// 수정: 화주사·품목코드는 바꿀 수 없다
export const itemSchema = z.object(itemShape).superRefine(crossRules)

// 등록: 화주사를 고르고 품목코드를 넣는다 (화주 포털은 자기 화주사로 고정)
export const itemCreateSchema = z
  .object({ shipperId: idField('화주사를 골라 주세요.'), code: itemCodeField, ...itemShape })
  .superRefine((value, ctx) => crossRules(value, ctx))

export type ItemInput = z.input<typeof itemSchema>
export type ItemData = z.output<typeof itemSchema>
export type ItemCreateInput = z.input<typeof itemCreateSchema>
export type ItemCreateData = z.output<typeof itemCreateSchema>
export type ItemUnitInput = z.input<typeof itemUnitSchema>
export type ItemBarcodeInput = z.input<typeof itemBarcodeSchema>

// 실제로 적용되는 라벨 단위: 품목에 비어 있으면 화주사 값 (로트·기한은 품목의 명시값 — 0083)
type Yn = 'Y' | 'N' | '' | null | undefined
export function effectiveItemOptions(
  item: { useLot: Yn | boolean; useExpiry: Yn | boolean; labelUnit: string | null | undefined },
  shipper: { useLot: boolean; useExpiry: boolean; labelUnit: LabelUnitValue },
) {
  const pick = (value: Yn | boolean, fallback: boolean) =>
    typeof value === 'boolean' ? value : value === 'Y' ? true : value === 'N' ? false : fallback
  return {
    useLot: pick(item.useLot, shipper.useLot),
    useExpiry: pick(item.useExpiry, shipper.useExpiry),
    labelUnit: (item.labelUnit || shipper.labelUnit) as LabelUnitValue,
  }
}
