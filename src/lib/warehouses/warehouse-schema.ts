import { z } from 'zod'
import { STOCK_STATUS, TEMP_ZONE } from '@/config/operator-codes'
import { idField, optionalIdSchema } from '@/lib/id'
import {
  oneOf,
  optionalCount,
  optionalDecimal,
  optionalText,
  requiredText,
} from '@/lib/validation/common-fields'
import { zonesSchema } from '@/lib/zones/zone-schema'
import { WAREHOUSE_TYPE } from './warehouse-codes'

// 창고 입력 규칙 — 화면·서버 공용 (docs/decisions/0074, docs/specs/warehouse.md)
// 1차 칸은 화면에서 입력, 2차 칸은 API만 받는다 (보내지 않으면 그대로 둔다 → .optional())

// 창고코드: 영문 대문자·숫자·밑줄 1~20자, 필수 (소문자는 대문자로). 등록 후 바꿀 수 없다 (서버가 무시)
export const warehouseCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, '창고코드를 입력해 주세요.')
  .max(20, '20자 이하로 입력해 주세요.')
  .regex(/^[A-Z0-9_]*$/, '창고코드는 영문 대문자·숫자·밑줄(_)만 씁니다.')

const yn = z.boolean()

export const warehouseShape = {
  // ① 기본 정보
  name: requiredText('창고명을 입력해 주세요.', 100),
  type: oneOf(WAREHOUSE_TYPE.values, '창고 유형을 골라 주세요.'),
  // 센터 취급 온도대 중 하나 (서버가 센터 값과 맞춰 본다)
  tempZone: oneOf(TEMP_ZONE.values, '온도대를 골라 주세요.'),
  description: optionalText(200),
  sortOrder: z.number().int('정수로 입력해 주세요.').min(0, '0 이상입니다.').max(9999),
  remark: optionalText(1000),
  // ② 위치·시설 (1차)
  buildingName: optionalText(50),
  floorNo: optionalText(10),
  areaM2: optionalDecimal(12, 2),
  // ③ 운영 속성 (1차): 유형을 고르면 화면이 유형별 기본값으로 채운다
  inbound: yn,
  outbound: yn,
  allocatable: yn,
  defaultStockStatus: oneOf(STOCK_STATUS.values, '기본 재고상태를 골라 주세요.'),
  allocPriority: z
    .number('할당 우선순위를 입력해 주세요.')
    .int('정수로 입력해 주세요.')
    .min(1, '1 이상입니다.')
    .max(999, '999 이하입니다.'),
  // 이 창고의 사용 중인 로케이션 (수정 화면에서만 고른다)
  defaultLocId: optionalIdSchema,

  // ── 2차: API만 (보내지 않으면 그대로)
  ceilingHeightM: optionalDecimal(5, 2).optional(),
  palletCapacity: optionalCount.optional(),
  // 운영사 공통코드 STORAGE_METHOD
  storageMethod: optionalText(20).optional(),
  // 센터가 보세·위험물 자격이 있을 때만 예
  bondedYn: yn.optional(),
  hazmatYn: yn.optional(),
  managerUserId: optionalIdSchema.optional(),
  dedicatedShipperId: optionalIdSchema.optional(),
  locCodePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .max(10, '10자 이하입니다.')
    .regex(/^[A-Z0-9]*$/, '영문 대문자·숫자만 씁니다.')
    .transform((value) => value || null)
    .optional(),
  // 로케이션 코드에 쓸 수 있는 구분자는 하이픈뿐 (없음 = 붙여 쓰기)
  locCodeSeparator: z
    .enum(['-', ''])
    .transform((value) => value || null)
    .optional(),
}

// 등록: 센터·코드 함께 (등록 후에는 센터·코드를 바꿀 수 없다)
export const warehouseCreateSchema = z.object({
  centerId: idField('센터를 골라 주세요.'),
  code: warehouseCodeField,
  ...warehouseShape,
})

// 수정: 구역 표 함께 (보내지 않으면 구역은 그대로, 0075)
export const warehouseUpdateSchema = z.object({ ...warehouseShape, zones: zonesSchema.optional() })

export type WarehouseCreateInput = z.input<typeof warehouseCreateSchema>
export type WarehouseData = z.output<typeof warehouseUpdateSchema>
export type WarehouseCreateData = Omit<WarehouseData, 'zones'>
// 화면 값 (등록·수정 공용 모양: 수정에서는 센터·코드가 읽기 전용, 구역 표는 수정에서만)
export const warehouseFormSchema = warehouseCreateSchema.extend({ zones: zonesSchema.optional() })
export type WarehouseFormValue = z.input<typeof warehouseFormSchema>
