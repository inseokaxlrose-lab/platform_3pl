import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTestUser } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  ACTING_OPERATOR_COOKIE,
  getActingOperator,
  getCurrentPermissions,
  getCurrentScope,
  getCurrentUser,
  requireUser,
} from './session'

// 세션 · 운영사 전환 (docs/decisions/0039)
// 로그인 세션(Better Auth)과 브라우저 쿠키는 흉내 낸다 — 검사하는 것은 session.ts의 판단

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

// 브라우저 쿠키 (테스트마다 비운다)
const cookieJar = new Map<string, string>()
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
  })),
}))

// redirect는 실제로는 예외를 던져 이동한다 → 이동할 주소를 담은 오류로
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
}))

// 이 사용자로 로그인한 것처럼 (DB에 있는 사용자)
async function loginAs(username: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } })
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: {
      id: String(user.id),
      name: user.name,
      username: user.username,
      displayUsername: user.username,
      userType: user.userType,
      status: user.status,
    },
  } as never)
}

let otherOperatorId = 0n

beforeEach(async () => {
  await resetDatabase()
  cookieJar.clear()
  otherOperatorId = (await createTestOperator('B물류')).id
  await createTestUser('boss', { userType: 'OPERATOR' })
  await prisma.user.create({
    data: { name: '플랫폼', email: 'p@users.local', username: 'platform', userType: 'PLATFORM' },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('플랫폼 관리자', () => {
  it('전환하지 않으면 운영사 데이터 범위가 없고, 운영사 화면에 들어가면 플랫폼 홈으로', async () => {
    await loginAs('platform')
    expect(await getActingOperator()).toBeNull()
    expect(await getCurrentScope()).toEqual({ kind: 'NONE' })
    const codes = await getCurrentPermissions()
    expect(codes.has('platform.operators.switch')).toBe(true)
    expect(codes.has('master.centers.read')).toBe(false)
    await expect(requireUser('admin')).rejects.toThrow('redirect:/platform')
    expect((await requireUser('platform')).username).toBe('platform')
  })

  it('운영사로 전환하면 그 운영사 전체 범위·운영사 화면 전체 권한, 운영사 화면에 들어간다', async () => {
    await loginAs('platform')
    cookieJar.set(ACTING_OPERATOR_COOKIE, String(otherOperatorId))
    expect(await getActingOperator()).toEqual({ id: otherOperatorId, name: 'B물류' })
    expect(await getCurrentScope()).toEqual({ kind: 'ALL', operatorId: otherOperatorId })
    const codes = await getCurrentPermissions()
    expect(codes.has('system.users.update')).toBe(true)
    expect(codes.has('platform.operators.read')).toBe(true)
    expect((await requireUser('admin')).username).toBe('platform')
  })

  it('정지된 운영사로도 전환할 수 있다 (플랫폼이 대신 확인), 없는 운영사·이상한 값은 무시', async () => {
    await loginAs('platform')
    await prisma.operator.update({
      where: { id: otherOperatorId },
      data: { status: 'SUSPENDED', statusReason: '테스트' },
    })
    cookieJar.set(ACTING_OPERATOR_COOKIE, String(otherOperatorId))
    expect(await getActingOperator()).not.toBeNull()

    cookieJar.set(ACTING_OPERATOR_COOKIE, '999999')
    expect(await getActingOperator()).toBeNull()
    cookieJar.set(ACTING_OPERATOR_COOKIE, '1 OR 1=1')
    expect(await getActingOperator()).toBeNull()
  })
})

describe('운영사 사용자', () => {
  it('전환 쿠키를 흉내 내도 무시된다 (자기 운영사 범위 그대로)', async () => {
    await loginAs('boss')
    cookieJar.set(ACTING_OPERATOR_COOKIE, String(otherOperatorId))
    expect(await getActingOperator()).toBeNull()
    expect(await getCurrentScope()).toEqual({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
    await expect(requireUser('platform')).rejects.toThrow('redirect:/admin')
  })

  it('운영사가 정지되면 이미 로그인해 있어도 로그인 안 된 것으로 본다', async () => {
    await loginAs('boss')
    expect(await getCurrentUser()).not.toBeNull()
    await prisma.operator.update({
      where: { id: TEST_OPERATOR_ID },
      data: { status: 'SUSPENDED', statusReason: '테스트' },
    })
    expect(await getCurrentUser()).toBeNull()
    expect(await getCurrentScope()).toEqual({ kind: 'NONE' })
    await expect(requireUser('admin')).rejects.toThrow('redirect:/login')
  })
})
