import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { exitActingOperatorAction } from '@/lib/platform/acting-actions'
import { prisma } from '@/lib/prisma'
import type { UserTypeValue } from '@/lib/redirect'
import { getCurrentPermissions, getCurrentUser } from '@/lib/session'
import { createTestUser } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listOperatorsAction, switchOperatorAction } from './actions'

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

const PLATFORM_CODES: PermissionCode[] = ['platform.operators.read', 'platform.operators.switch']

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
  otherId = (await createTestOperator('B물류')).id
  await prisma.operator.update({ where: { id: otherId }, data: { status: 'SUSPENDED' } })
  await createTestUser('boss', { userType: 'OPERATOR' })
  signIn('PLATFORM', PLATFORM_CODES)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('운영사 목록', () => {
  it('모든 운영사를 최신 등록순으로, 사용자 수와 함께 · 상태로 거르기', async () => {
    const all = await listOperatorsAction(createDataGridState())
    expect(all.ok && all.data.rows.map((r) => [r.name, r.status, r.userCount])).toEqual([
      ['B물류', 'SUSPENDED', 0],
      ['테스트운영사', 'ACTIVE', 1],
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
