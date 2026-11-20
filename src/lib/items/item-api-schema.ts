import { z } from 'zod'
import { ITEM_STATUS } from './item-codes'

// 품목 API 입력 규칙 (docs/decisions/0083 ③, 정의서 7장) — 연동 이름으로 받는다 (필드 대응: docs/api-item-fields.md)
// 부분 수정: 안 보낸 칸은 그대로, null은 값 지우기 (거래처 API와 같다)
// 값의 자세한 검사(코드 목록·소수 자리·조건부 필수)는 품목 입력 규칙(item-schema)이 저장 때 한다

// 숫자는 숫자 또는 숫자 글자로 받는다 (소수 칸은 글자로 바꿔 계산)
const decimal = z.union([
  z.number().nonnegative(),
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/),
])
const signedDecimal = z.union([
  z.number(),
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/),
])
const int = z.number().int().nonnegative()
const text = (max: number) =>
  z.string().trim().max(max, `${max}자 이하입니다.`).nullable().optional()

// 단위 한 줄: uom = 단위 코드(우리 코드 또는 외부코드 매핑), level을 안 보내면 이미 있는 같은 단위의 레벨
export const apiItemUomSchema = z.object({
  uom: z.string().trim().min(1, 'uom을 보내 주세요.').max(20),
  level: z.enum(['INNER', 'BOX', 'PLT']).optional(),
  qtyInBase: decimal.optional(),
  widthCm: decimal.nullable().optional(),
  depthCm: decimal.nullable().optional(),
  heightCm: decimal.nullable().optional(),
  grossWeightKg: decimal.nullable().optional(),
  netWeightKg: decimal.nullable().optional(),
  // true면 그 레벨 행을 지운다 (기본단위는 지울 수 없다)
  delete: z.boolean().optional(),
})

// 바코드 한 줄: barcode로 찾아 추가·수정, delete면 지운다
export const apiItemBarcodeSchema = z.object({
  uom: z.string().trim().min(1, 'uom을 보내 주세요.').max(20),
  barcode: z.string().trim().min(1, 'barcode를 보내 주세요.').max(50),
  type: z.string().trim().toUpperCase().optional(),
  primary: z.boolean().optional(),
  delete: z.boolean().optional(),
})

export const apiItemSchema = z.object({
  // 찾는 키는 화주사 연동 조회 키에 따른다 (0084): CODE → itemCd 필수, CUST_CD → itemCustCd 필수
  // CUST_CD 화주가 새 품목에 itemCd를 안 보내면 품목코드는 자동 생성
  itemCd: z.string().trim().max(50, '50자 이하입니다.').optional(),
  itemCustCd: text(50),
  itemNm: z.string().trim().max(200).optional(),
  itemNmEn: text(200),
  shortNm: text(50),
  spec: text(100),
  itemType: z.string().trim().toUpperCase().optional(),
  category1: text(50),
  category2: text(50),
  category3: text(50),
  brandNm: text(100),
  makerNm: text(100),
  originCountry: text(2),
  hsCode: text(12),
  itemValue: decimal.nullable().optional(),
  currency: text(3),
  baseUom: z.string().trim().min(1).max(20).optional(),
  // 기본 입고·주문단위 (null = 자동: 입고 BOX·없으면 기본단위 / 주문 기본단위)
  defaultInboundUom: z.string().trim().max(20).nullable().optional(),
  defaultOrderUom: z.string().trim().max(20).nullable().optional(),
  uoms: z.array(apiItemUomSchema).max(4, 'uoms는 4개까지입니다.').optional(),
  // 팔레트 적재: 있으면 PLT를 계산한다 (null = 적재 정보 지움)
  pallet: z
    .object({
      type: z.string().trim().toUpperCase().max(20).nullable().optional(),
      ti: int.nullable().optional(),
      hi: int.nullable().optional(),
      boxQty: int.nullable().optional(),
    })
    .nullable()
    .optional(),
  tempZone: z.string().trim().toUpperCase().optional(),
  storageTempMin: signedDecimal.nullable().optional(),
  storageTempMax: signedDecimal.nullable().optional(),
  hazmat: z.boolean().optional(),
  fragile: z.boolean().optional(),
  upright: z.boolean().optional(),
  maxStackBox: int.nullable().optional(),
  // 새 품목에서 안 보내면 화주사 설정을 따른다
  expiryMgmt: z.boolean().optional(),
  expiryType: z.string().trim().toUpperCase().nullable().optional(),
  expiryInput: z.string().trim().toUpperCase().nullable().optional(),
  shelfLifeDays: int.nullable().optional(),
  minInboundShelfDays: int.nullable().optional(),
  minOutboundShelfDays: int.nullable().optional(),
  expiryAlertDays: int.nullable().optional(),
  lotMgmt: z.boolean().optional(),
  lotSource: z.string().trim().toUpperCase().nullable().optional(),
  serialMgmt: z.boolean().optional(),
  // null = 화주사 값 따름
  allocRule: z.string().trim().toUpperCase().nullable().optional(),
  labelUom: z.enum(['PLT', 'BOX']).nullable().optional(),
  boxOnlyShip: z.boolean().optional(),
  barcodes: z.array(apiItemBarcodeSchema).max(50, 'barcodes는 50개까지입니다.').optional(),
  status: z.enum(ITEM_STATUS.values).optional(),
  remark: text(1000),
})

export type ApiItemInput = z.output<typeof apiItemSchema>
