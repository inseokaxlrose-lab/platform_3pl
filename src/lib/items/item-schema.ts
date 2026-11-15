import { z } from 'zod'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import { idField } from '@/lib/id'
import { LABEL_UNITS, type LabelUnitValue } from '@/lib/shippers/shipper-schema'
import { optionalText, requiredText } from '@/lib/validation/common-fields'

// 품목 입력 규칙 — 화면·서버 공용 (docs/decisions/0041, 0003 결정 2·3·6)

// 환산단위는 한 품목에 몇 개까지 (BOX·CARTON·PLT·PACK… 실제로는 2~4개)
export const MAX_ITEM_UNITS = 10

// 관리 옵션: '' = 화주사 기본값 따름 / 'Y' 사용 / 'N' 안 함 (DB는 null / 'Y' / 'N')
export const INHERIT = ''
const ynOrInherit = z.enum([INHERIT, 'Y', 'N'], '골라 주세요.')

// 품목코드(SKU): 영문·숫자·점·하이픈·밑줄 2~30자, 대문자로 저장. 비우면 시스템 코드 (0025)
export const itemCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .max(30, '30자 이하로 입력해 주세요.')
  .refine(
    (value) => value === '' || (value.length >= 2 && /^[A-Z0-9._-]+$/.test(value)),
    '품목코드는 영문·숫자·점·하이픈·밑줄 2~30자입니다.',
  )

// 숫자 글자 (화면 입력은 글자) → 숫자, 비어 있으면 null
const optionalWholeNumber = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (/^\d+$/.test(value) && +value >= min && +value <= max),
      message,
    )
    .transform((value) => (value === '' ? null : Number(value)))

// 환산단위 한 줄: 단위 + 입수량(기본단위 기준, 0보다 큰 수 — 소수 자리는 서버가 기본단위 기준으로 확인)
export const itemUnitSchema = z.object({
  unitId: idField('환산단위를 골라 주세요.'),
  convQty: z
    .string()
    .trim()
    .refine(
      (value) => /^\d+(\.\d+)?$/.test(value) && Number(value) > 0,
      '입수량을 0보다 크게 입력해 주세요.',
    ),
})

const itemShape = {
  code: itemCodeField,
  name: requiredText('품목명을 입력해 주세요.', 200),
  spec: optionalText(100),
  // 바코드: 영문·숫자·하이픈 (선택, 같은 화주사 안에서 중복 금지)
  barcode: z
    .string()
    .trim()
    .max(50, '50자 이하로 입력해 주세요.')
    .refine(
      (value) => value === '' || /^[A-Za-z0-9-]+$/.test(value),
      '바코드는 영문·숫자·하이픈입니다.',
    )
    .transform((value) => value || null),
  baseUnitId: idField('기본단위를 골라 주세요.'),
  useLot: ynOrInherit,
  useExpiry: ynOrInherit,
  labelUnit: z.enum([INHERIT, ...LABEL_UNITS], '골라 주세요.'),
  expiryAlertDays: optionalWholeNumber(1, 3650, '1~3650일로 입력해 주세요.'),
  remark: optionalText(1000),
  units: z
    .array(itemUnitSchema)
    .max(MAX_ITEM_UNITS, `환산단위는 ${MAX_ITEM_UNITS}개까지 등록할 수 있습니다.`)
    .superRefine((units, ctx) => {
      // 같은 환산단위를 두 번 넣을 수 없다
      const seen = new Set<string>()
      units.forEach((unit, index) => {
        if (seen.has(unit.unitId.toString())) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'unitId'],
            message: '이미 넣은 환산단위입니다.',
          })
        }
        seen.add(unit.unitId.toString())
      })
    }),
  externalCodes: externalCodesSchema,
}

// 수정: 화주사는 바꿀 수 없다 (재고·이력이 화주사에 묶인다)
export const itemSchema = z.object(itemShape)

// 등록: 화주사를 고른다 (화주 포털은 자기 화주사로 고정)
export const itemCreateSchema = z.object({
  shipperId: idField('화주사를 골라 주세요.'),
  ...itemShape,
})

export type ItemInput = z.input<typeof itemSchema>
export type ItemData = z.output<typeof itemSchema>
export type ItemCreateInput = z.input<typeof itemCreateSchema>
export type ItemCreateData = z.output<typeof itemCreateSchema>

// 실제로 적용되는 관리 옵션: 품목에 비어 있으면 화주사 기본값 (화면 안내·서버 저장·이후 검수가 같이 쓴다)
type OptionValue = '' | 'Y' | 'N' | null | undefined
export function effectiveItemOptions(
  item: { useLot: OptionValue; useExpiry: OptionValue; labelUnit: string | null | undefined },
  shipper: { useLot: boolean; useExpiry: boolean; labelUnit: LabelUnitValue },
) {
  const pick = (value: OptionValue, fallback: boolean) =>
    value === 'Y' ? true : value === 'N' ? false : fallback
  return {
    useLot: pick(item.useLot, shipper.useLot),
    useExpiry: pick(item.useExpiry, shipper.useExpiry),
    labelUnit: (item.labelUnit || shipper.labelUnit) as LabelUnitValue,
  }
}
