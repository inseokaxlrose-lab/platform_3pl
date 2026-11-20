import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentSessionId, getCurrentUser } from '@/lib/session'
import { createUserAccount } from '@/lib/users/create-user-account'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { changePasswordAction } from './actions'

// 본인 비밀번호 변경 (0086)
// 로그인은 실제 Better Auth로 해서 세션을 만들고, 서버 액션의 "현재 사용자·세션"만 흉내 낸다

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(async () => new Set()),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })),
  getCurrentSessionId: vi.fn(),
}))

// 테스트 전용 비밀번호 (테스트 DB에서만 사용)
const TEMP = 'temp-pass-1234'
const NEW = 'new-pass-5678'

let userId = 0n

const signIn = (password: string) =>
  auth.api.signInUsername({ body: { username: 'kim.worker', password } })

// 지금 기기(첫 로그인)를 현재 세션으로 둔다
async function signedInHere(passwordChangeRequired = true) {
  await signIn(TEMP)
  const session = await prisma.session.findFirstOrThrow({ where: { userId } })
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: userId,
    name: '김작업',
    username: 'kim.worker',
    userType: 'CENTER',
    passwordChangeRequired,
  })
  vi.mocked(getCurrentSessionId).mockResolvedValue(String(session.id))
  return session.id
}

beforeEach(async () => {
  await resetDatabase()
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set())
  userId = (
    await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'kim.worker',
      password: TEMP,
      name: '김작업',
      userType: 'OPERATOR',
    })
  ).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('본인 비밀번호 변경', () => {
  it('임시 비밀번호 상태에서도 바꿀 수 있고, 바꾸면 표시를 풀고 다른 기기 로그인만 끊는다', async () => {
    const here = await signedInHere()
    await signIn(TEMP) // 다른 기기
    expect(await prisma.session.count({ where: { userId } })).toBe(2)

    expect(
      await changePasswordAction({
        currentPassword: TEMP,
        newPassword: NEW,
        newPasswordConfirm: NEW,
      }),
    ).toMatchObject({ ok: true })

    const sessions = await prisma.session.findMany({ where: { userId }, select: { id: true } })
    expect(sessions.map((s) => s.id)).toEqual([here])
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordChangeReqYn: true },
    })
    expect(row.passwordChangeReqYn).toBe('N')
    await expect(signIn(TEMP)).rejects.toBeTruthy()
    expect(await signIn(NEW)).toBeTruthy()
  })

  it('현재 비밀번호가 틀리면 바꾸지 않는다', async () => {
    await signedInHere()
    expect(
      await changePasswordAction({
        currentPassword: 'wrong-pass-1',
        newPassword: NEW,
        newPasswordConfirm: NEW,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: '현재 비밀번호가 맞지 않습니다.' },
    })
    expect(await signIn(TEMP)).toBeTruthy()
  })

  it('입력 규칙: 현재와 같으면·확인이 다르면·규칙에 맞지 않으면·아이디와 같으면 거부', async () => {
    await signedInHere(false)
    expect(
      await changePasswordAction({
        currentPassword: TEMP,
        newPassword: TEMP,
        newPasswordConfirm: 'other-1234',
      }),
    ).toMatchObject({
      ok: false,
      error: {
        fieldErrors: {
          newPassword: ['현재 비밀번호와 다른 비밀번호를 넣어 주세요.'],
          newPasswordConfirm: ['비밀번호가 서로 다릅니다.'],
        },
      },
    })
    expect(
      await changePasswordAction({
        currentPassword: TEMP,
        newPassword: 'abcdefgh',
        newPasswordConfirm: 'abcdefgh',
      }),
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: { newPassword: ['비밀번호에 숫자를 넣어 주세요.'] } },
    })
    // 아이디 'kim.worker'에 숫자가 없으므로 숫자를 붙인 아이디로 확인
    await prisma.user.update({
      where: { id: userId },
      data: { username: 'kim.worker1', displayUsername: 'kim.worker1' },
    })
    expect(
      await changePasswordAction({
        currentPassword: TEMP,
        newPassword: 'Kim.Worker1',
        newPasswordConfirm: 'Kim.Worker1',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: '아이디와 같은 비밀번호는 쓸 수 없습니다.' },
    })
  })

  it('로그인하지 않았으면 거부', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    expect(
      await changePasswordAction({
        currentPassword: TEMP,
        newPassword: NEW,
        newPasswordConfirm: NEW,
      }),
    ).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })
})
