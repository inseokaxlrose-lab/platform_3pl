import { z } from 'zod'
import {
  addressShape,
  optionalEmail,
  optionalPhone,
  optionalText,
} from '@/lib/validation/common-fields'
import { formatBusinessNumber, isValidBusinessNumber } from './business-number'

// 운영사 정보 입력 규칙 — 화면과 서버가 같은 규칙을 쓴다 (docs/decisions/0024)

export const MAX_COMPANY_CONTACTS = 5

export const companyContactSchema = z.object({
  duty: z
    .string()
    .trim()
    .min(1, '담당 업무를 입력해 주세요.')
    .max(50, '50자 이하로 입력해 주세요.'),
  name: z.string().trim().min(1, '담당자명을 입력해 주세요.').max(30, '30자 이하로 입력해 주세요.'),
  phone: optionalPhone,
  email: optionalEmail,
})

export const companySchema = z.object({
  name: z.string().trim().min(1, '회사명을 입력해 주세요.').max(100, '100자 이하로 입력해 주세요.'),
  businessNumber: z
    .string()
    .trim()
    .refine(isValidBusinessNumber, '사업자등록번호를 확인해 주세요. (10자리, 검증번호 불일치)')
    .transform(formatBusinessNumber),
  ceoName: optionalText(30),
  businessType: optionalText(50),
  businessItem: optionalText(50),
  phone: optionalPhone,
  fax: optionalPhone,
  email: optionalEmail,
  ...addressShape,
  contacts: z
    .array(companyContactSchema)
    .max(MAX_COMPANY_CONTACTS, `담당자는 ${MAX_COMPANY_CONTACTS}명까지 등록할 수 있습니다.`),
})

// 화면 입력값 (모두 글자) / 저장할 값 (빈 칸은 null, 사업자번호는 000-00-00000)
export type CompanyInput = z.input<typeof companySchema>
export type CompanyData = z.output<typeof companySchema>
export type CompanyContactInput = z.input<typeof companyContactSchema>

export const EMPTY_CONTACT: CompanyContactInput = { duty: '', name: '', phone: '', email: '' }
