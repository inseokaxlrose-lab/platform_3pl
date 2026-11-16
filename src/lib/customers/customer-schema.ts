import { z } from 'zod'
import { contactsSchema } from '@/lib/contacts/contact-schema'
import { idField } from '@/lib/id'
import {
  addressShape,
  optionalBusinessNumber,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
} from '@/lib/validation/common-fields'

// 거래처 입력 규칙 — 화면·서버 공용 (docs/decisions/0043)

// 담당자 규칙은 운영사·화주사와 같다
export {
  CONTACT_ROLE_GROUP,
  EMPTY_CONTACT,
  MAX_CONTACTS as MAX_CUSTOMER_CONTACTS,
} from '@/lib/contacts/contact-schema'

// 거래처코드: 영문·숫자·점·하이픈·밑줄 2~30자, 대문자로 저장. 비우면 시스템 코드 (0025)
export const customerCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .max(30, '30자 이하로 입력해 주세요.')
  .refine(
    (value) => value === '' || (value.length >= 2 && /^[A-Z0-9._-]+$/.test(value)),
    '거래처코드는 영문·숫자·점·하이픈·밑줄 2~30자입니다.',
  )

const customerShape = {
  code: customerCodeField,
  name: requiredText('거래처명을 입력해 주세요.', 200),
  businessNumber: optionalBusinessNumber,
  ceoName: optionalText(50),
  phone: optionalPhone,
  email: optionalEmail,
  // 배송지
  ...addressShape,
  // 법정동코드 10자리 (주소 검색 결과를 자동으로 채운다, 화면 미노출)
  regionCode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{10}$/.test(value), '법정동코드는 숫자 10자리입니다.')
    .transform((value) => value || null),
  receiverName: optionalText(50),
  receiverPhone: optionalPhone,
  deliveryMemo: optionalText(200),
  remark: optionalText(1000),
  contacts: contactsSchema,
}

// 수정: 화주사는 바꿀 수 없다
export const customerSchema = z.object(customerShape)

// 등록: 화주사를 고른다
export const customerCreateSchema = z.object({
  shipperId: idField('화주사를 골라 주세요.'),
  ...customerShape,
})

export type CustomerInput = z.input<typeof customerSchema>
export type CustomerData = z.output<typeof customerSchema>
export type CustomerCreateInput = z.input<typeof customerCreateSchema>
export type CustomerCreateData = z.output<typeof customerCreateSchema>
