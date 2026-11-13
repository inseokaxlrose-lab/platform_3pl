import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '@/config/permissions'
import { COMPANY_ID, getCompany } from '@/lib/company/company'
import type { CompanyInput } from '@/lib/company/company-schema'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentUser } from '@/lib/session'
import { createTestUser } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import { saveCompanyAction } from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL' })),
}))

let adminId = ''

function signIn(codes: PermissionCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: adminId,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
}

const input = (overrides: Partial<CompanyInput> = {}): CompanyInput => ({
  name: '예시물류(주)',
  businessNumber: '1234567891',
  ceoName: '홍대표',
  businessType: '서비스',
  businessItem: '물류대행',
  phone: '02-123-4567',
  fax: '02-123-4568',
  email: '',
  zipCode: '06236',
  address: '서울 강남구 테헤란로 1',
  addressDetail: '3층',
  contacts: [
    { duty: '입고 문의', name: '김입고', phone: '010-1111-2222', email: 'in@example.com' },
    { duty: '정산', name: '이정산', phone: '', email: '' },
  ],
  ...overrides,
})

beforeEach(async () => {
  await resetDatabase()
  adminId = (await createTestUser('boss', { userType: 'OPERATOR' })).id
  signIn(['master.company.read', 'master.company.update'])
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('운영사 정보 저장', () => {
  it('처음 저장하면 만들고, 담당자는 입력 순서대로, 고친 사람을 남긴다', async () => {
    expect(await getCompany()).toBeNull()
    expect(await saveCompanyAction(input())).toEqual({ ok: true, data: { saved: true } })

    const company = await getCompany()
    expect(company).toMatchObject({
      id: COMPANY_ID,
      businessNumber: '123-45-67891',
      email: null,
      updatedById: adminId,
    })
    expect(company?.contacts.map((c) => [c.sortOrder, c.name, c.email])).toEqual([
      [0, '김입고', 'in@example.com'],
      [1, '이정산', null],
    ])
  })

  it('다시 저장하면 같은 한 줄을 고치고, 담당자는 통째로 바뀐다', async () => {
    await saveCompanyAction(input())
    await saveCompanyAction(
      input({
        name: '새이름물류',
        contacts: [{ duty: '출고 문의', name: '박출고', phone: '', email: '' }],
      }),
    )

    expect(await prisma.company.count()).toBe(1)
    const company = await getCompany()
    expect(company?.name).toBe('새이름물류')
    expect(company?.contacts.map((c) => c.name)).toEqual(['박출고'])
    expect(await prisma.companyContact.count()).toBe(1)
  })

  it('입력 규칙에 맞지 않으면 칸별 오류, 저장하지 않는다', async () => {
    const result = await saveCompanyAction(input({ businessNumber: '1234567890', fax: 'x' }))
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { businessNumber: [expect.any(String)], fax: [expect.any(String)] },
      },
    })
    expect(await getCompany()).toBeNull()
  })

  it('수정 권한이 없으면 거부한다 (조회 권한만으로는 안 됨)', async () => {
    signIn(['master.company.read'])
    expect(await saveCompanyAction(input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(await getCompany()).toBeNull()
  })
})
