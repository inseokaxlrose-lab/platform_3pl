import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '@/config/permissions'
import { getOperator } from '@/lib/operator/operator'
import type { OperatorInput } from '@/lib/operator/operator-schema'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentUser } from '@/lib/session'
import { createTestCodeGroup, createTestUser } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { saveOperatorAction } from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })),
}))

let adminId = 0n

function signIn(codes: PermissionCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: adminId,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
}

const input = (overrides: Partial<OperatorInput> = {}): OperatorInput => ({
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
    {
      duty: 'INBOUND',
      name: '김입고',
      phone: '010-1111-2222',
      email: 'in@example.com',
      isPrimary: true,
    },
    { duty: 'SETTLEMENT', name: '이정산', phone: '', email: 'pay@example.com', isPrimary: false },
  ],
  ...overrides,
})

// 저장: 내 운영사의 지금 버전을 붙여 보낸다 — 화면이 불러온 버전 대신
async function save(value: OperatorInput) {
  const current = await prisma.operator.findUniqueOrThrow({
    where: { id: TEST_OPERATOR_ID },
    select: { rowVersion: true },
  })
  return saveOperatorAction({ ...value, rowVersion: current.rowVersion })
}

const myOperator = () => getOperator(TEST_OPERATOR_ID)

beforeEach(async () => {
  await resetDatabase()
  adminId = (await createTestUser('boss', { userType: 'OPERATOR' })).id
  await createTestCodeGroup('CONTACT_DUTY', [
    { code: 'INBOUND' },
    { code: 'OUTBOUND' },
    { code: 'SETTLEMENT' },
    { code: 'OLD', isActive: false },
  ])
  signIn(['master.company.read', 'master.company.update'])
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('운영사 정보 저장', () => {
  it('내 운영사 정보를 고치고, 담당자는 입력 순서대로, 고친 사람을 남긴다', async () => {
    expect(await save(input())).toEqual({ ok: true, data: { rowVersion: 2 } })

    const company = await myOperator()
    expect(company).toMatchObject({
      id: TEST_OPERATOR_ID,
      businessNumber: '1234567891',
      email: null,
      // 수정자는 로그인 사용자 아이디로 자동 기록 (운영사는 테스트 준비에서 system이 만들었다)
      createdBy: 'system',
      updatedBy: 'boss',
      rowVersion: 2,
    })
    expect(
      company?.contacts.map((c) => [c.sortOrder, c.duty, c.name, c.phone, c.isPrimary]),
    ).toEqual([
      // 대표 여부는 DB에 'Y'/'N'으로
      [0, 'INBOUND', '김입고', '01011112222', 'Y'],
      [1, 'SETTLEMENT', '이정산', null, 'N'],
    ])
  })

  it('다시 저장하면 담당자는 통째로 바뀐다', async () => {
    await save(input())
    await save(
      input({
        name: '새이름물류',
        contacts: [
          { duty: 'OUTBOUND', name: '박출고', phone: '010-1234-5678', email: '', isPrimary: true },
        ],
      }),
    )

    const company = await myOperator()
    expect(company?.name).toBe('새이름물류')
    expect(company?.contacts.map((c) => c.name)).toEqual(['박출고'])
    expect(await prisma.operatorContact.count()).toBe(1)
  })

  it('다른 운영사의 정보는 건드리지 않는다 (0039)', async () => {
    const other = await createTestOperator('다른물류')
    await save(input({ name: '새이름물류' }))
    expect(await getOperator(other.id)).toMatchObject({ name: '다른물류', rowVersion: 1 })
  })

  it('입력 규칙에 맞지 않으면 칸별 오류, 저장하지 않는다', async () => {
    const result = await save(input({ businessNumber: '1234567890', fax: 'x' }))
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { businessNumber: [expect.any(String)], fax: [expect.any(String)] },
      },
    })
    expect((await myOperator())?.name).toBe('테스트운영사')
  })

  it('담당 업무: 없는 코드·사용 중지 코드는 거부, 이미 저장돼 있던 사용 중지 코드는 그대로 둘 수 있다', async () => {
    const contact = { name: '김', phone: '', email: 'a@example.com', isPrimary: true }
    expect(await save(input({ contacts: [{ ...contact, duty: 'NOPE' }] }))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('NOPE') },
    })
    expect(await save(input({ contacts: [{ ...contact, duty: 'OLD' }] }))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('OLD') },
    })

    // 저장한 뒤 코드를 사용 중지해도, 그 담당자를 그대로 두고 다시 저장할 수 있다
    await save(input({ contacts: [{ ...contact, duty: 'OUTBOUND' }] }))
    await prisma.codeItem.updateMany({ where: { code: 'OUTBOUND' }, data: { status: 'INACTIVE' } })
    expect(
      await save(input({ name: '바뀜', contacts: [{ ...contact, duty: 'OUTBOUND' }] })),
    ).toMatchObject({ ok: true })
  })

  it('담당자 규칙: 연락처·이메일 중 하나, 대표 1명', async () => {
    const result = await save(
      input({
        contacts: [
          { duty: 'INBOUND', name: '김', phone: '', email: '', isPrimary: false },
          { duty: 'INBOUND', name: '이', phone: '', email: 'b@example.com', isPrimary: false },
        ],
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      error: {
        fieldErrors: {
          'contacts.0.phone': [expect.stringContaining('하나는')],
          contacts: ['대표 담당자를 1명 정해 주세요.'],
        },
      },
    })
  })

  it('수정 권한이 없으면 거부한다 (조회 권한만으로는 안 됨)', async () => {
    signIn(['master.company.read'])
    expect(await save(input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect((await myOperator())?.name).toBe('테스트운영사')
  })
})
