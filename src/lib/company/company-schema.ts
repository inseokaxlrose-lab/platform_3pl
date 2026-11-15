import { z } from 'zod'
import {
  addressShape,
  exactlyOne,
  optionalEmail,
  optionalPhone,
  optionalText,
  requireOneOf,
} from '@/lib/validation/common-fields'
import { digitsOnly, isValidBusinessNumber } from '@/lib/format'

// 운영사 정보 입력 규칙 — 화면과 서버가 같은 규칙을 쓴다 (docs/decisions/0024)

export const MAX_COMPANY_CONTACTS = 5

// 담당 업무 공통코드 그룹 (0030). 코드가 실제로 있는지는 저장할 때 서버가 확인한다
export const CONTACT_DUTY_GROUP = 'CONTACT_DUTY'

export const companyContactSchema = z
  .object({
    duty: z.string().trim().min(1, '담당 업무를 골라 주세요.'),
    name: z
      .string()
      .trim()
      .min(1, '담당자명을 입력해 주세요.')
      .max(30, '30자 이하로 입력해 주세요.'),
    phone: optionalPhone,
    email: optionalEmail,
    isPrimary: z.boolean(),
  })
  .superRefine(requireOneOf(['phone', 'email'], '연락처와 이메일 중 하나는 입력해 주세요.'))

export const companySchema = z.object({
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
  contacts: z
    .array(companyContactSchema)
    .max(MAX_COMPANY_CONTACTS, `담당자는 ${MAX_COMPANY_CONTACTS}명까지 등록할 수 있습니다.`)
    .superRefine(exactlyOne('isPrimary', '대표 담당자를 1명 정해 주세요.')),
})

// 화면 입력값 (모두 글자) / 저장할 값 (빈 칸은 null, 사업자번호·전화번호는 숫자만)
export type CompanyInput = z.input<typeof companySchema>
export type CompanyData = z.output<typeof companySchema>
export type CompanyContactInput = z.input<typeof companyContactSchema>

export const EMPTY_CONTACT: CompanyContactInput = {
  duty: '',
  name: '',
  phone: '',
  email: '',
  isPrimary: false,
}
