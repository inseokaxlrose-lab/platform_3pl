import { z } from 'zod'
import {
  BIZ_ENTITY,
  OPERATOR_STATUS,
  OPERATOR_TYPE,
  STATUSES_NEEDING_REASON,
  TAX_TYPE,
} from '@/config/operator-codes'
import { contactsSchema } from '@/lib/contacts/contact-schema'
import { digitsOnly, isValidBusinessNumber, isValidCorpRegNumber } from '@/lib/format'
import { idSchema } from '@/lib/id'
import { rowVersionField } from '@/lib/row-version'
import {
  addressShape,
  optionalEmail,
  optionalPhone,
  optionalText,
} from '@/lib/validation/common-fields'

// 운영사 정보 입력 규칙 — 화면과 서버가 같은 규칙을 쓴다 (docs/specs/operator.md [1차], 0024·0040)
// - 플랫폼(전체)과 운영사 자기 화면(일부)이 같은 칸을 쓰되, 운영사코드·유형·상태는 플랫폼만 정한다
// - 길이는 정의서(DB 칸) 길이와 같게

// 담당자 규칙은 화주사와 함께 쓴다 (src/lib/contacts/contact-schema.ts)
export {
  CONTACT_ROLE_GROUP,
  EMPTY_CONTACT,
  MAX_CONTACTS as MAX_OPERATOR_CONTACTS,
} from '@/lib/contacts/contact-schema'

// 값 목록 안의 코드인지 (플랫폼이 정하는 상수 코드)
const oneOf = (set: { has: (value: string) => boolean }, message: string) =>
  z.string().refine((value) => set.has(value), message)

const businessNumberField = z
  .string()
  .trim()
  .refine(isValidBusinessNumber, '사업자등록번호를 확인해 주세요. (10자리, 검증번호 불일치)')
  .transform(digitsOnly)

// 날짜 (선택): 'YYYY-MM-DD' 또는 빈 글자 → Date(자정 UTC) 또는 null
const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))),
    '날짜를 확인해 주세요.',
  )
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))

// 운영사 자기 화면에서도 고칠 수 있는 칸
const editableShape = {
  name: z.string().trim().min(1, '회사명을 입력해 주세요.').max(100, '100자 이하로 입력해 주세요.'),
  nameEn: optionalText(100),
  shortName: optionalText(50),
  businessNumber: businessNumberField,
  bizEntity: oneOf(BIZ_ENTITY, '사업자 구분을 골라 주세요.'),
  // 법인등록번호: 법인일 때만 (개인이면 저장할 때 비운다)
  corpRegNo: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || isValidCorpRegNumber(value),
      '법인등록번호를 확인해 주세요. (13자리, 검증번호 불일치)',
    )
    .transform((value) => digitsOnly(value) || null),
  subBizNo: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{4}$/.test(value), '종사업장번호는 숫자 4자리입니다.')
    .transform((value) => value || null),
  taxType: oneOf(TAX_TYPE, '과세유형을 골라 주세요.'),
  ceoName: optionalText(50),
  businessType: optionalText(100),
  businessItem: optionalText(100),
  establishedOn: optionalDate,
  phone: optionalPhone,
  fax: optionalPhone,
  email: optionalEmail,
  ...addressShape,
  // 주소 검색 결과의 지번주소 (화면에 보이지 않고 자동으로 채운다)
  addressJibun: optionalText(200),
  remark: optionalText(1000),
  contacts: contactsSchema,
}

// 개인 사업자면 법인등록번호를 비운다 (서버 액션은 버전 칸을 붙인 규칙으로 검사한 뒤 이 함수를 부른다)
export function clearCorpRegNo<T extends { bizEntity: string; corpRegNo: string | null }>(
  data: T,
): T {
  return data.bizEntity === 'CORP' ? data : { ...data, corpRegNo: null }
}

// 운영사 자기 화면 저장 (/admin/master/operator): 유형·상태·코드는 받지 않는다
export const operatorSelfObject = z.object(editableShape)
export const operatorSelfSchema = operatorSelfObject.transform(clearCorpRegNo)

// 플랫폼 편집 저장 (/platform/operators/[id]): 유형까지 (상태는 상태 변경 팝업으로 따로)
export const operatorObject = z.object({
  ...editableShape,
  type: oneOf(OPERATOR_TYPE, '운영사 유형을 골라 주세요.'),
})
export const operatorSchema = operatorObject.transform(clearCorpRegNo)

// 화면 입력값 (모두 글자) / 저장할 값 (빈 칸은 null, 번호는 숫자만)
export type OperatorInput = z.input<typeof operatorSchema>
export type OperatorData = z.output<typeof operatorSchema>
export type OperatorSelfData = z.output<typeof operatorSelfSchema>

// 운영사코드: 영문 대문자·숫자·_- 2~20자 (소문자는 대문자로), 등록 후 바꿀 수 없다
export const operatorCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,20}$/, '영문·숫자·밑줄·하이픈 2~20자로 입력해 주세요.')

// 플랫폼 · 운영사 등록 (0039 3c, 0040): 기본 정보만 받고 나머지는 등록 후 편집 화면에서
// 관리자 아이디는 'admin.' + 운영사코드 소문자 (예: NARA → admin.nara). 아이디는 전체에서 하나
export const OPERATOR_ADMIN_PREFIX = 'admin.'
export const adminUsernameOf = (operatorCode: string) =>
  `${OPERATOR_ADMIN_PREFIX}${operatorCode.trim().toLowerCase()}`

export const operatorRegisterSchema = z.object({
  code: operatorCodeField,
  name: editableShape.name,
  businessNumber: businessNumberField,
  ceoName: editableShape.ceoName,
  type: oneOf(OPERATOR_TYPE, '운영사 유형을 골라 주세요.'),
})

export type OperatorRegisterInput = z.input<typeof operatorRegisterSchema>
export type OperatorRegisterData = z.output<typeof operatorRegisterSchema>

// 운영 상태 변경 (플랫폼, 팝업): 정지·해지로 바꿀 때는 사유가 필수
export const operatorStatusSchema = z
  .object({
    id: idSchema,
    rowVersion: rowVersionField,
    status: oneOf(OPERATOR_STATUS, '상태를 골라 주세요.'),
    reason: optionalText(200),
  })
  .superRefine((data, ctx) => {
    if (STATUSES_NEEDING_REASON.includes(data.status) && !data.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: '정지·해지 사유를 입력해 주세요.' })
    }
  })

export type OperatorStatusInput = z.input<typeof operatorStatusSchema>
