import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { companySchema, MAX_COMPANY_CONTACTS, type CompanyInput } from './company-schema'

const input = (overrides: Partial<CompanyInput> = {}): CompanyInput => ({
  name: ' 예시물류(주) ',
  businessNumber: '1234567891',
  ceoName: '',
  businessType: '',
  businessItem: '',
  phone: '02-123-4567',
  fax: '',
  email: 'Info@Example.com',
  zipCode: '06236',
  address: '서울 강남구 테헤란로 1',
  addressDetail: '',
  contacts: [],
  ...overrides,
})

const errorsOf = (value: CompanyInput) => {
  const parsed = companySchema.safeParse(value)
  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors
}

describe('운영사 정보 입력 규칙', () => {
  it('정리해서 저장할 값을 만든다 (공백 제거, 빈 칸 null, 번호 모양, 이메일 소문자)', () => {
    expect(companySchema.parse(input())).toMatchObject({
      name: '예시물류(주)',
      businessNumber: '123-45-67891',
      ceoName: null,
      fax: null,
      email: 'info@example.com',
      zipCode: '06236',
    })
  })

  it('회사명·사업자번호는 필수, 사업자번호는 검증번호까지 확인', () => {
    expect(errorsOf(input({ name: '  ', businessNumber: '1234567890' }))).toMatchObject({
      name: ['회사명을 입력해 주세요.'],
      businessNumber: [expect.stringContaining('사업자등록번호')],
    })
  })

  it('전화·팩스·이메일·우편번호 형식', () => {
    expect(
      errorsOf(input({ phone: '02-12', fax: '02)123-4567', email: 'nope', zipCode: '1234' })),
    ).toMatchObject({
      phone: [expect.stringContaining('8~12자리')],
      fax: [expect.stringContaining('8~12자리')],
      email: ['이메일 형식이 아닙니다.'],
      zipCode: ['우편번호는 숫자 5자리입니다.'],
    })
    expect(errorsOf(input({ phone: '1588-1234', fax: '010-1234-5678' }))).toEqual({})
  })

  it(`담당자: 업무·이름 필수, 최대 ${MAX_COMPANY_CONTACTS}명`, () => {
    const contact = { duty: '입고 문의', name: '김담당', phone: '010-1234-5678', email: '' }
    expect(companySchema.parse(input({ contacts: [contact] })).contacts).toEqual([
      { duty: '입고 문의', name: '김담당', phone: '010-1234-5678', email: null },
    ])

    const missing = companySchema.safeParse(input({ contacts: [{ ...contact, name: '' }] }))
    expect(missing.success).toBe(false)

    expect(
      errorsOf(input({ contacts: Array(MAX_COMPANY_CONTACTS + 1).fill(contact) })),
    ).toMatchObject({
      contacts: [`담당자는 ${MAX_COMPANY_CONTACTS}명까지 등록할 수 있습니다.`],
    })
  })
})
