import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_DISABLED, auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resetDatabase } from '@/test/reset-database'
import { createUserAccount } from './create-user-account'

// 테스트 전용 비밀번호 (테스트 DB에서만 사용)
const PASSWORD = 'test-password-1234'

function signIn(username: string, password = PASSWORD) {
  return auth.api.signInUsername({ body: { username, password } })
}

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('계정 만들기 + 로그인 (Better Auth)', () => {
  it('만든 계정으로 아이디·비밀번호 로그인이 된다', async () => {
    await createUserAccount({
      username: 'worker1',
      password: PASSWORD,
      name: '김작업',
      userType: 'CENTER',
    })

    const result = await signIn('worker1')

    expect(result?.token).toBeTruthy()
    expect(await prisma.session.count()).toBe(1)
  })

  it('비밀번호는 암호화되어 저장된다', async () => {
    const user = await createUserAccount({
      username: 'worker2',
      password: PASSWORD,
      name: '이작업',
      userType: 'CENTER',
    })
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } })

    expect(account.providerId).toBe('credential')
    expect(account.password).not.toContain(PASSWORD)
    expect(account.password!.length).toBeGreaterThan(30)
  })

  it('이메일이 없으면 내부용 주소를 채운다', async () => {
    const user = await createUserAccount({
      username: 'NoMail',
      password: PASSWORD,
      name: '박작업',
      userType: 'CENTER',
    })
    expect(user.email).toBe('nomail@users.local')
  })

  it('비밀번호가 틀리면 로그인되지 않는다', async () => {
    await createUserAccount({
      username: 'worker3',
      password: PASSWORD,
      name: '최작업',
      userType: 'CENTER',
    })
    await expect(signIn('worker3', 'wrong-password')).rejects.toBeTruthy()
    expect(await prisma.session.count()).toBe(0)
  })

  it('없는 아이디도 같은 방식으로 실패한다', async () => {
    await expect(signIn('nobody')).rejects.toBeTruthy()
  })

  it('사용 중지된 계정은 로그인되지 않는다', async () => {
    const user = await createUserAccount({
      username: 'leaver',
      password: PASSWORD,
      name: '퇴사자',
      userType: 'CENTER',
    })
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })

    await expect(signIn('leaver')).rejects.toMatchObject({ message: ACCOUNT_DISABLED })
    expect(await prisma.session.count()).toBe(0)
  })

  it('아이디는 대소문자를 구분하지 않는다', async () => {
    await createUserAccount({
      username: 'Kim.Worker',
      password: PASSWORD,
      name: '김작업',
      userType: 'SHIPPER',
    })
    const result = await signIn('KIM.WORKER')
    expect(result?.user).toMatchObject({ username: 'kim.worker' })
  })

  it('같은 아이디로 두 번 만들 수 없다 (대소문자만 달라도)', async () => {
    await createUserAccount({
      username: 'dup',
      password: PASSWORD,
      name: '중복',
      userType: 'CENTER',
    })
    await expect(
      createUserAccount({ username: 'DUP', password: PASSWORD, name: '중복2', userType: 'CENTER' }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('규칙에 맞지 않는 아이디·짧은 비밀번호는 거부한다', async () => {
    await expect(
      createUserAccount({
        username: '한글아이디',
        password: PASSWORD,
        name: 'x',
        userType: 'CENTER',
      }),
    ).rejects.toThrow(/아이디/)
    await expect(
      createUserAccount({ username: 'short', password: '1234', name: 'x', userType: 'CENTER' }),
    ).rejects.toThrow(/8자 이상/)
  })
})
