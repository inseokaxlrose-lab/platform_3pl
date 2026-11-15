import { z } from 'zod'
import { isYes } from '@/lib/yn'
import {
  exactlyOne,
  optionalEmail,
  optionalPhone,
  requireOneOf,
} from '@/lib/validation/common-fields'

// 담당자 입력 규칙 — 운영사·화주사(·거래처) 공용 (docs/decisions/0031, 0035)
// 담당 업무는 공통코드 CONTACT_DUTY, 연락처·이메일 중 하나 필수, 최대 5명, 대표 1명

export const MAX_CONTACTS = 5

// 담당 업무 공통코드 그룹 (0030). 코드가 실제로 있는지는 저장할 때 서버가 확인한다
export const CONTACT_DUTY_GROUP = 'CONTACT_DUTY'

export const contactSchema = z
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

export const contactsSchema = z
  .array(contactSchema)
  .max(MAX_CONTACTS, `담당자는 ${MAX_CONTACTS}명까지 등록할 수 있습니다.`)
  .superRefine(exactlyOne('isPrimary', '대표 담당자를 1명 정해 주세요.'))

export type ContactInput = z.input<typeof contactSchema>
export type ContactData = z.output<typeof contactSchema>

export const EMPTY_CONTACT: ContactInput = {
  duty: '',
  name: '',
  phone: '',
  email: '',
  isPrimary: false,
}

// 저장한 담당자 줄 (DB: 빈 칸 null, 대표 여부 'Y'/'N')
type ContactRow = Omit<ContactData, 'isPrimary'> & { isPrimary: string }

// 저장한 담당자 → 입력값 (빈 칸은 빈 글자, 대표 여부는 true/false)
export const toContactInput = ({
  duty,
  name,
  phone,
  email,
  isPrimary,
}: ContactRow): ContactInput => ({
  duty,
  name,
  phone: phone ?? '',
  email: email ?? '',
  isPrimary: isYes(isPrimary),
})
