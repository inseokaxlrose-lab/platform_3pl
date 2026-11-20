import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  adminUsernameOf,
  MAX_OPERATOR_CONTACTS,
  operatorRegisterSchema,
  operatorSchema,
  operatorSelfSchema,
  operatorStatusSchema,
  type OperatorInput,
} from './operator-schema'

const input = (overrides: Partial<OperatorInput> = {}): OperatorInput => ({
  name: ' 예시물류(주) ',
  nameEn: '',
  shortName: '',
  type: '3PL',
  businessNumber: '1234567891',
  bizEntity: 'CORP',
  corpRegNo: '',
  subBizNo: '',
  taxType: 'GENERAL',
  establishedOn: '',
  addressJibun: '',
  remark: '',
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

const errorsOf = (value: OperatorInput) => {
  const parsed = operatorSchema.safeParse(value)
  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors
}

describe('운영사 정보 입력 규칙', () => {
  it('정리해서 저장할 값을 만든다 (공백 제거, 빈 칸 null, 번호는 숫자만, 이메일 소문자)', () => {
    expect(operatorSchema.parse(input())).toMatchObject({
      name: '예시물류(주)',
      businessNumber: '1234567891',
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
      phone: [expect.stringContaining('전화번호를 확인')],
      fax: [expect.stringContaining('전화번호를 확인')],
      email: ['이메일 형식이 아닙니다.'],
      zipCode: ['우편번호는 숫자 5자리입니다.'],
    })
    expect(errorsOf(input({ phone: '1588-1234', fax: '010-1234-5678' }))).toEqual({})
    expect(
      operatorSchema.parse(input({ phone: '02-123-4567', fax: '010 1234 5678' })),
    ).toMatchObject({ phone: '021234567', fax: '01012345678' })
  })

  it(`담당자: 업무·이름 필수, 연락처·이메일 중 하나, 대표 1명, 최대 ${MAX_OPERATOR_CONTACTS}명`, () => {
    const contact = {
      duty: 'INBOUND',
      name: '김담당',
      phone: '010-1234-5678',
      email: '',
      isPrimary: true,
    }
    expect(operatorSchema.parse(input({ contacts: [contact] })).contacts).toEqual([
      {
        duty: 'INBOUND',
        name: '김담당',
        phone: '01012345678',
        email: null,
        isPrimary: true,
        // 부서·직책·알림을 안 보내면 빈 칸·알림 받음 (0084 ④-3)
        deptName: null,
        positionName: null,
        notify: true,
      },
    ])

    expect(errorsOf(input({ contacts: [{ ...contact, duty: '', name: '', phone: '' }] }))).toEqual({
      contacts: expect.any(Array),
    })
    const issues = operatorSchema
      .safeParse(input({ contacts: [{ ...contact, duty: '', name: '', phone: '' }] }))
      .error!.issues.map((i) => [i.path.join('.'), i.message])
    expect(issues).toEqual([
      ['contacts.0.duty', '담당 업무를 골라 주세요.'],
      ['contacts.0.name', '담당자명을 입력해 주세요.'],
      ['contacts.0.phone', '연락처와 이메일 중 하나는 입력해 주세요.'],
    ])

    expect(errorsOf(input({ contacts: [{ ...contact, isPrimary: false }] }))).toEqual({
      contacts: ['대표 담당자를 1명 정해 주세요.'],
    })
    expect(
      errorsOf(input({ contacts: Array(MAX_OPERATOR_CONTACTS + 1).fill(contact) })),
    ).toMatchObject({
      contacts: expect.arrayContaining([
        `담당자는 ${MAX_OPERATOR_CONTACTS}명까지 등록할 수 있습니다.`,
      ]),
    })
  })

  it('플랫폼이 정하는 코드는 값 목록 안에서만 (유형·사업자 구분·과세유형)', () => {
    expect(errorsOf(input({ type: 'SHOP', bizEntity: 'X', taxType: '' }))).toMatchObject({
      type: ['운영사 유형을 골라 주세요.'],
      bizEntity: ['사업자 구분을 골라 주세요.'],
      taxType: ['과세유형을 골라 주세요.'],
    })
  })

  it('법인등록번호는 검증번호까지, 개인 사업자면 저장할 때 비운다 · 종사업장번호·설립일 형식', () => {
    expect(
      errorsOf(input({ corpRegNo: '110111-1111112', subBizNo: '12', establishedOn: '2026-13-40' })),
    ).toMatchObject({
      corpRegNo: [expect.stringContaining('법인등록번호')],
      subBizNo: ['종사업장번호는 숫자 4자리입니다.'],
      establishedOn: ['날짜를 확인해 주세요.'],
    })
    expect(
      operatorSchema.parse(input({ corpRegNo: '110111-1111113', establishedOn: '2020-03-02' })),
    ).toMatchObject({ corpRegNo: '1101111111113', establishedOn: new Date('2020-03-02T00:00:00Z') })
    expect(
      operatorSchema.parse(input({ bizEntity: 'INDIVIDUAL', corpRegNo: '110111-1111113' }))
        .corpRegNo,
    ).toBeNull()
  })

  it('운영사 자기 화면 규칙에는 유형이 없다 (보내도 버린다)', () => {
    expect(operatorSelfSchema.parse(input({ type: 'MIXED' }))).not.toHaveProperty('type')
  })
})

describe('운영사 등록 · 상태 변경 입력 규칙 (0040)', () => {
  const register = {
    code: ' nara ',
    name: '나라물류',
    businessNumber: '312-81-12349',
    ceoName: '',
    type: '3PL',
  }

  it('운영사코드는 대문자로, 영문·숫자·_- 2~20자 · 관리자 아이디는 admin.{코드 소문자}', () => {
    expect(operatorRegisterSchema.parse(register)).toMatchObject({ code: 'NARA', ceoName: null })
    expect(operatorRegisterSchema.safeParse({ ...register, code: '나라' }).success).toBe(false)
    expect(operatorRegisterSchema.safeParse({ ...register, code: 'A' }).success).toBe(false)
    expect(adminUsernameOf('NARA_2')).toBe('admin.nara_2')
  })

  it('정지·해지로 바꿀 때는 사유가 필수', () => {
    const status = { id: '1', rowVersion: 1, reason: '' }
    expect(operatorStatusSchema.safeParse({ ...status, status: 'ACTIVE' }).success).toBe(true)
    const suspended = operatorStatusSchema.safeParse({ ...status, status: 'SUSPENDED' })
    expect(suspended.error?.issues[0]).toMatchObject({
      path: ['reason'],
      message: '정지·해지 사유를 입력해 주세요.',
    })
    expect(
      operatorStatusSchema.safeParse({ ...status, status: 'TERMINATED', reason: '계약 종료' })
        .success,
    ).toBe(true)
    expect(operatorStatusSchema.safeParse({ ...status, status: 'CLOSED' }).success).toBe(false)
  })
})
