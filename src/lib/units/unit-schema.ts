import { z } from 'zod'
import { idSchema } from '@/lib/id'
import { rowVersionField } from '@/lib/row-version'
import { requiredText } from '@/lib/validation/common-fields'
import { isPhysicalType, UNIT_TYPES } from './unit-labels'

// 단위 입력 규칙 — 화면·서버 공용 (docs/decisions/0034·0078)

export const MAX_UNIT_DECIMALS = 6

// 코드: 영문 대문자로 시작, 대문자·숫자·밑줄 1~10자 (예: EA, KG, BOX, M2)
export const unitCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9_]{0,9}$/,
    '단위 코드는 영문 대문자로 시작하는 대문자·숫자·밑줄 1~10자입니다.',
  )

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이하로 입력해 주세요.`)
    .transform((v) => v || null)

// 환산계수: 0보다 큰 수, 정수 10자리·소수 10자리까지 (DB DECIMAL(20,10)). 글자로 주고받는다
export const baseFactorField = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ''))
  .refine(
    (v) => v === '' || /^\d{1,10}(\.\d{1,10})?$/.test(v),
    '환산계수는 정수 10자리·소수 10자리까지의 숫자입니다.',
  )
  .refine((v) => v === '' || /[1-9]/.test(v), '환산계수는 0보다 커야 합니다.')
  .transform((v) => v || null)

const fields = {
  name: requiredText('단위명을 입력해 주세요.', 50),
  nameEn: optionalText(50),
  printName: optionalText(20),
  decimals: z
    .number({ error: '소수 자리수는 숫자로 입력해 주세요.' })
    .int('소수 자리수는 정수로 입력해 주세요.')
    .min(0, '0 이상으로 입력해 주세요.')
    .max(MAX_UNIT_DECIMALS, `${MAX_UNIT_DECIMALS} 이하로 입력해 주세요.`),
  sortOrder: z.number().int().min(0).max(9999, '9999 이하로 입력해 주세요.'),
  // 환산계수 (물리 단위만, 1 이 단위 = 계수 × 유형 기준단위)
  baseFactor: baseFactorField,
  stdCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(10, '표준코드는 10자 이하입니다.')
    .transform((v) => v || null),
  description: optionalText(200),
  remark: optionalText(1000),
  isActive: z.boolean(),
}

// 유형별 규칙: 물리 단위는 환산계수 필수, 그 밖의 유형은 환산계수를 두지 않는다
function checkFactor(data: { type: string; baseFactor: string | null }, ctx: z.RefinementCtx) {
  if (isPhysicalType(data.type) && !data.baseFactor) {
    ctx.addIssue({
      code: 'custom',
      path: ['baseFactor'],
      message: '중량·부피·길이·면적 단위는 기준단위 환산계수를 입력해 주세요. (예: 1 근 = 0.6 KG)',
    })
  }
}
const dropFactor = <T extends { type: string; baseFactor: string | null }>(data: T): T =>
  isPhysicalType(data.type) ? data : { ...data, baseFactor: null }

export const unitCreateSchema = z
  .object({ code: unitCodeField, type: z.enum(UNIT_TYPES, '단위 유형을 골라 주세요.'), ...fields })
  .superRefine(checkFactor)
  .transform(dropFactor)

// 수정: 코드·유형은 바꿀 수 없어 받지 않는다 (서버가 저장된 유형으로 검사). rowVersion: 불러올 때의 버전
export const unitUpdateSchema = z
  .object({
    id: idSchema,
    rowVersion: rowVersionField,
    type: z.enum(UNIT_TYPES),
    ...fields,
  })
  .superRefine(checkFactor)
  .transform(dropFactor)

export type UnitCreateInput = z.input<typeof unitCreateSchema>
export type UnitCreateData = z.output<typeof unitCreateSchema>
export type UnitUpdateData = z.output<typeof unitUpdateSchema>
