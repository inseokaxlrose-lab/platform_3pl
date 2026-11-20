import { z } from 'zod'
import { optionalText, requiredText } from '@/lib/validation/common-fields'
import { idField, idSchema } from '@/lib/id'
import { rowVersionField } from '@/lib/row-version'
import { FAULT_PARTY_VALUES } from '@/config/db-codes'

// 공통코드 입력 규칙 — 화면·서버 공용 (docs/decisions/0030)
// 그룹 코드·코드는 등록 후 바꿀 수 없다 (업무 표에 코드 글자가 저장되므로) → 수정 규칙에는 code가 없다

const sortOrder = z
  .number({ error: '정렬 순서는 숫자로 입력해 주세요.' })
  .int('정렬 순서는 정수로 입력해 주세요.')
  .min(0, '0 이상으로 입력해 주세요.')
  .max(9999, '9999 이하로 입력해 주세요.')

const common = {
  name: requiredText('이름을 입력해 주세요.', 50),
  description: optionalText(200),
  sortOrder,
  isActive: z.boolean(),
}

// 그룹 코드: 영문 대문자로 시작, 대문자·숫자·밑줄 2~30자 (예: CONTACT_ROLE)
export const groupCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9_]{1,29}$/,
    '그룹 코드는 영문 대문자로 시작하는 대문자·숫자·밑줄 2~30자입니다.',
  )

// 코드: 대문자·숫자·밑줄·하이픈 1~20자 (예: INBOUND, 01) — 업무 표의 코드 칸이 VARCHAR(20)이라 (0084 ④-2)
export const itemCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{1,20}$/, '코드는 영문 대문자·숫자·밑줄·하이픈 1~20자입니다.')

// 사유 코드 그룹: 코드마다 귀책을 둘지 (0087)
const groupExtra = { usesFaultParty: z.boolean().default(false) }
// 귀책: 비우면 없음 (그룹이 귀책을 쓰지 않으면 서버가 비운다)
const itemExtra = {
  faultParty: z.union([z.literal(''), z.enum(FAULT_PARTY_VALUES)]).default(''),
}

export const codeGroupCreateSchema = z.object({ code: groupCodeField, ...common, ...groupExtra })
// rowVersion: 팝업을 열 때의 버전 (동시 수정 막기)
export const codeGroupUpdateSchema = z.object({
  id: idSchema,
  rowVersion: rowVersionField,
  ...common,
  ...groupExtra,
})

export const codeItemCreateSchema = z.object({
  groupId: idField('그룹을 골라 주세요.'),
  code: itemCodeField,
  ...common,
  ...itemExtra,
})
export const codeItemUpdateSchema = z.object({
  id: idSchema,
  rowVersion: rowVersionField,
  ...common,
  ...itemExtra,
})

export type CodeGroupCreateInput = z.input<typeof codeGroupCreateSchema>
export type CodeItemCreateInput = z.input<typeof codeItemCreateSchema>
