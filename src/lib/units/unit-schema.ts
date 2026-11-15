import { z } from 'zod'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import { requiredText } from '@/lib/validation/common-fields'
import { UNIT_KINDS } from './unit-labels'

// 단위 입력 규칙 — 화면·서버 공용 (docs/decisions/0034)

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

const fields = {
  name: requiredText('이름을 입력해 주세요.', 30),
  kind: z.enum(UNIT_KINDS, '종류를 골라 주세요.'),
  decimals: z
    .number({ error: '소수 자리수는 숫자로 입력해 주세요.' })
    .int('소수 자리수는 정수로 입력해 주세요.')
    .min(0, '0 이상으로 입력해 주세요.')
    .max(MAX_UNIT_DECIMALS, `${MAX_UNIT_DECIMALS} 이하로 입력해 주세요.`),
  sortOrder: z.number().int().min(0).max(9999, '9999 이하로 입력해 주세요.'),
  isActive: z.boolean(),
  externalCodes: externalCodesSchema,
}

// 환산단위는 소수 자리수가 의미 없으므로 0으로 맞춘다 (입수량은 품목에서 기본단위로 정한다)
const normalize = <T extends { kind: string; decimals: number }>(data: T): T =>
  data.kind === 'PACK' ? { ...data, decimals: 0 } : data

export const unitCreateSchema = z.object({ code: unitCodeField, ...fields }).transform(normalize)
export const unitUpdateSchema = z.object({ id: z.string().min(1), ...fields }).transform(normalize)

export type UnitCreateInput = z.input<typeof unitCreateSchema>
export type UnitCreateData = z.output<typeof unitCreateSchema>
export type UnitUpdateData = z.output<typeof unitUpdateSchema>
