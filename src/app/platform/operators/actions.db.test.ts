import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { exitActingOperatorAction } from '@/lib/platform/acting-actions'
import { prisma } from '@/lib/prisma'
import type { UserTypeValue } from '@/lib/redirect'
import { auth } from '@/lib/auth'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCodeGroup, createTestUser } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  changeOperatorStatusAction,
  createOperatorAction,
  listOperatorsAction,
  switchOperatorAction,
  updateOperatorAction,
} from './actions'

// 플랫폼 · 운영사 목록과 운영사 전환 (docs/decisions/0039)

vi.mock('@/lib/session', () => ({
  ACTING_OPERATOR_COOKIE: 'acting_operator',
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'NONE' })),
}))

// 브라우저 쿠키
const cookieJar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  })),
}))

const PLATFORM_CODES: PermissionCode[] = [
  'platform.operators.read',
  'platform.operators.create',
  'platform.operators.update',
  'platform.operators.switch',
]

function signIn(userType: UserTypeValue, codes: PermissionCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'platform',
    userType,
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
}

let otherId = 0n

beforeEach(async () => {
  await resetDatabase()
  cookieJar.clear()
  otherId = (await createTestOperator('B물류', 'BMUL')).id
  await prisma.operator.update({
    where: { id: otherId },
    data: { status: 'SUSPENDED', statusReason: '테스트 정지' },
  })
  await createTestUser('boss', { userType: 'OPERATOR' })
  signIn('PLATFORM', PLATFORM_CODES)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('운영사 목록', () => {
  it('모든 운영사를 최신 등록순으로, 사용자 수와 함께 · 상태로 거르기', async () => {
    const all = await listOperatorsAction(createDataGridState())
    expect(
      all.ok && all.data.rows.map((r) => [r.code, r.name, r.status, r.userCount, r.centerCount]),
    ).toEqual([
      ['BMUL', 'B물류', 'SUSPENDED', 0, 0],
      ['TEST', '테스트운영사', 'ACTIVE', 1, 0],
    ])
    const suspended = await listOperatorsAction({
      ...createDataGridState(),
      filters: { status: 'SUSPENDED' },
    })
    expect(suspended.ok && suspended.data.rows.map((r) => r.name)).toEqual(['B물류'])
  })

  it('플랫폼 권한이 없으면(운영사 사용자) 볼 수 없다', async () => {
    signIn('OPERATOR', ['master.centers.read'])
    expect(await listOperatorsAction(createDataGridState())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})

describe('운영사 전환', () => {
  it('[이 운영사로 작업]: 전환 쿠키를 두고, [나가기]: 쿠키를 지운다', async () => {
    expect(await switchOperatorAction({ id: String(otherId) })).toEqual({
      ok: true,
      data: { id: String(otherId), name: 'B물류' },
    })
    expect(cookieJar.get('acting_operator')).toBe(String(otherId))

    expect(await exitActingOperatorAction({})).toMatchObject({ ok: true })
    expect(cookieJar.has('acting_operator')).toBe(false)
  })

  it('없는 운영사는 "찾을 수 없음"', async () => {
    expect(await switchOperatorAction({ id: '999999' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(cookieJar.size).toBe(0)
  })

  it('플랫폼 관리자가 아니면 전환할 수 없다 (권한을 잘못 받았어도)', async () => {
    signIn('OPERATOR', PLATFORM_CODES)
    expect(await switchOperatorAction({ id: String(TEST_OPERATOR_ID) })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(cookieJar.size).toBe(0)
  })
})

describe('운영사 등록 (3c)', () => {
  // 관리자 처음 비밀번호(서버 설정) — 테스트 전용 값
  const PASSWORD = 'first-password-1234'
  const register = (overrides: Record<string, string> = {}) =>
    createOperatorAction({
      name: '나라물류(주)',
      businessNumber: '312-81-12349',
      ceoName: '김나라',
      code: 'Nara',
      type: '3PL',
      ...overrides,
    })

  beforeEach(() => {
    vi.stubEnv('SEED_ADMIN_PASSWORD', PASSWORD)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('운영사 + 기본값 + 관리자 admin.○○(슈퍼 관리자)를 한 번에, 그 아이디로 로그인된다', async () => {
    const result = await register()
    expect(result).toMatchObject({
      ok: true,
      data: { code: 'NARA', name: '나라물류(주)', adminUsername: 'admin.nara' },
    })
    const id = BigInt(result.ok ? result.data.id : 0)
    expect(await prisma.operator.findUniqueOrThrow({ where: { id } })).toMatchObject({
      businessNumber: '3128112349',
      status: 'ACTIVE',
      createdBy: 'platform',
    })
    expect(await prisma.codeGroup.count({ where: { operatorId: id } })).toBeGreaterThan(0)
    const admin = await prisma.user.findUniqueOrThrow({
      where: { username: 'admin.nara' },
      include: { permissionGroups: { include: { group: true } } },
    })
    expect(admin).toMatchObject({ operatorId: id, userType: 'OPERATOR' })
    expect(admin.permissionGroups.map((g) => [g.group.name, g.group.operatorId])).toEqual([
      ['슈퍼 관리자', id],
    ])
    expect(
      (await auth.api.signInUsername({ body: { username: 'admin.nara', password: PASSWORD } }))
        ?.user,
    ).toBeDefined()
  })

  it('운영사로 작업 중이어도 새 운영사의 데이터로 만든다 (작업 중인 운영사와 섞이지 않는다)', async () => {
    vi.mocked(getCurrentScope).mockResolvedValueOnce({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
    const result = await register()
    expect(result.ok).toBe(true)
    const id = BigInt(result.ok ? result.data.id : 0)
    expect(await prisma.codeGroup.count({ where: { operatorId: TEST_OPERATOR_ID } })).toBe(0)
    expect(await prisma.codeGroup.count({ where: { operatorId: id } })).toBeGreaterThan(0)
  })

  it('운영사코드·관리자 아이디가 이미 있으면 거부하고 아무것도 만들지 않는다', async () => {
    expect((await register()).ok).toBe(true)
    expect(await register({ name: '다른물류' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('운영사코드') },
    })
    // 운영사코드는 다르지만 관리자 아이디(admin.{코드})가 이미 쓰이는 경우
    await prisma.user.update({
      where: { username: 'admin.nara' },
      data: { username: 'admin.lime' },
    })
    expect(await register({ name: '다른물류', code: 'LIME' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('admin.lime') },
    })
    expect(await prisma.operator.count({ where: { name: '다른물류' } })).toBe(0)
  })

  it('입력 규칙: 사업자번호 검증번호, 아이디 뒷자리 모양', async () => {
    expect(await register({ businessNumber: '1234567890', code: 'a b' })).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { businessNumber: [expect.any(String)], code: [expect.any(String)] },
      },
    })
  })

  it('처음 비밀번호 설정이 없으면 거부, 플랫폼 관리자가 아니면 거부', async () => {
    vi.stubEnv('SEED_ADMIN_PASSWORD', '')
    expect(await register()).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('SEED_ADMIN_PASSWORD') },
    })
    vi.stubEnv('SEED_ADMIN_PASSWORD', PASSWORD)
    signIn('OPERATOR', PLATFORM_CODES)
    expect(await register()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(await prisma.operator.count()).toBe(2)
  })
})

describe('운영사 수정 · 상태 변경 (0040)', () => {
  const versionOfOperator = async (id: bigint) =>
    (await prisma.operator.findUniqueOrThrow({ where: { id } })).rowVersion
  const edit = async (id: bigint, overrides: Record<string, unknown> = {}) =>
    updateOperatorAction({
      id: String(id),
      rowVersion: await versionOfOperator(id),
      name: 'B물류(주)',
      nameEn: '',
      shortName: '',
      type: 'FULFILLMENT',
      businessNumber: '312-81-12349',
      bizEntity: 'CORP',
      corpRegNo: '',
      subBizNo: '',
      taxType: 'SIMPLE',
      ceoName: '',
      businessType: '',
      businessItem: '',
      establishedOn: '',
      phone: '',
      fax: '',
      email: '',
      zipCode: '',
      address: '',
      addressDetail: '',
      addressJibun: '',
      remark: '',
      contacts: [],
      ...overrides,
    })

  it('플랫폼은 유형까지 고친다 (운영사코드는 그대로), 기록은 플랫폼 관리자', async () => {
    expect(await edit(otherId)).toMatchObject({ ok: true })
    expect(await prisma.operator.findUniqueOrThrow({ where: { id: otherId } })).toMatchObject({
      code: 'BMUL',
      name: 'B물류(주)',
      type: 'FULFILLMENT',
      taxType: 'SIMPLE',
      updatedBy: 'platform',
    })
  })

  it('담당 업무는 그 운영사의 공통코드로 검사한다 (다른 운영사의 코드는 안 된다)', async () => {
    await createTestCodeGroup('CONTACT_ROLE', [{ code: 'INBOUND' }])
    const contact = { duty: 'INBOUND', name: '김', phone: '', email: 'a@b.co', isPrimary: true }
    // B물류에는 CONTACT_ROLE이 없다 → 테스트운영사의 INBOUND로는 저장할 수 없다
    expect(await edit(otherId, { contacts: [contact] })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('INBOUND') },
    })
    expect(await edit(TEST_OPERATOR_ID, { contacts: [contact] })).toMatchObject({ ok: true })
  })

  it('상태 변경: 정지·해지는 사유 필수, 운영으로 되돌리면 사유를 비운다', async () => {
    const change = async (status: string, reason = '') =>
      changeOperatorStatusAction({
        id: String(TEST_OPERATOR_ID),
        rowVersion: await versionOfOperator(TEST_OPERATOR_ID),
        status,
        reason,
      })
    expect(await change('SUSPENDED')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { reason: [expect.any(String)] } },
    })
    expect(await change('SUSPENDED', '연체')).toMatchObject({ ok: true })
    expect(
      await prisma.operator.findUniqueOrThrow({ where: { id: TEST_OPERATOR_ID } }),
    ).toMatchObject({ status: 'SUSPENDED', statusReason: '연체' })
    expect(await change('SUSPENDED', '또')).toMatchObject({
      ok: false,
      error: { message: '지금과 같은 상태입니다.' },
    })
    expect(await change('ACTIVE')).toMatchObject({ ok: true })
    expect(
      await prisma.operator.findUniqueOrThrow({ where: { id: TEST_OPERATOR_ID } }),
    ).toMatchObject({ status: 'ACTIVE', statusReason: null })
  })

  it('플랫폼 관리자가 아니면 수정·상태 변경할 수 없다', async () => {
    signIn('OPERATOR', PLATFORM_CODES)
    expect(await edit(otherId)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
