import { z } from 'zod'
import { contactsSchema } from '@/lib/contacts/contact-schema'
import {
  addressShape,
  optionalEmail,
  optionalPhone,
  optionalText,
} from '@/lib/validation/common-fields'
import { digitsOnly, isValidBusinessNumber } from '@/lib/format'

// 운영사 정보 입력 규칙 — 화면과 서버가 같은 규칙을 쓴다 (docs/decisions/0024)

// 담당자 규칙은 화주사와 함께 쓴다 (src/lib/contacts/contact-schema.ts)
export {
  CONTACT_DUTY_GROUP,
  EMPTY_CONTACT,
  MAX_CONTACTS as MAX_OPERATOR_CONTACTS,
} from '@/lib/contacts/contact-schema'

export const operatorSchema = z.object({
  name: z.string().trim().min(1, '회사명을 입력해 주세요.').max(100, '100자 이하로 입력해 주세요.'),
  businessNumber: z
    .string()
    .trim()
    .refine(isValidBusinessNumber, '사업자등록번호를 확인해 주세요. (10자리, 검증번호 불일치)')
    .transform(digitsOnly),
  ceoName: optionalText(30),
  businessType: optionalText(50),
  businessItem: optionalText(50),
  phone: optionalPhone,
  fax: optionalPhone,
  email: optionalEmail,
  ...addressShape,
  contacts: contactsSchema,
})

// 화면 입력값 (모두 글자) / 저장할 값 (빈 칸은 null, 사업자번호·전화번호는 숫자만)
export type OperatorInput = z.input<typeof operatorSchema>
export type OperatorData = z.output<typeof operatorSchema>
