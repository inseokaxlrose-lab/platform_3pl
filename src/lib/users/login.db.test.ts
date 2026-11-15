import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_DISABLED, auth, OPERATOR_DISABLED } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { createUserAccount } from './create-user-account'

// 테스트 전용 비밀번호 (테스트 DB에서만 사용)
const PASSWORD = 'test-password-1234'

function signIn(username: string, password = PASSWORD) {
  return auth.api.signInUsername({ body: { username, password } })
}

// 테스트마다 새로 만드는 소속 센터·화주사
let centerId = 0n
let shipperId = 0n

beforeEach(async () => {
  await resetDatabase()
  centerId = (await createTestCenter('ICN')).id
  shipperId = (await createTestShipper('GANA')).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('계정 만들기 + 로그인 (Better Auth)', () => {
  it('만든 계정으로 아이디·비밀번호 로그인이 된다', async () => {
    await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'worker1',
      password: PASSWORD,
      name: '김작업',
      userType: 'CENTER',
      centerIds: [centerId],
    })

    const result = await signIn('worker1')

    expect(result?.token).toBeTruthy()
    expect(await prisma.session.count()).toBe(1)
  })

  it('비밀번호는 암호화되어 저장된다', async () => {
    const user = await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'worker2',
      password: PASSWORD,
      name: '이작업',
      userType: 'CENTER',
      centerIds: [centerId],
    })
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } })

    expect(account.providerId).toBe('credential')
    expect(account.password).not.toContain(PASSWORD)
    expect(account.password!.length).toBeGreaterThan(30)
  })

  it('이메일이 없으면 내부용 주소를 채운다', async () => {
    const user = await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'NoMail',
      password: PASSWORD,
      name: '박작업',
      userType: 'CENTER',
      centerIds: [centerId],
    })
    expect(user.email).toBe('nomail@users.local')
  })

  it('비밀번호가 틀리면 로그인되지 않는다', async () => {
    await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'worker3',
      password: PASSWORD,
      name: '최작업',
      userType: 'CENTER',
      centerIds: [centerId],
    })
    await expect(signIn('worker3', 'wrong-password')).rejects.toBeTruthy()
    expect(await prisma.session.count()).toBe(0)
  })

  it('없는 아이디도 같은 방식으로 실패한다', async () => {
    await expect(signIn('nobody')).rejects.toBeTruthy()
  })

  it('사용 중지된 계정은 로그인되지 않는다', async () => {
    const user = await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'leaver',
      password: PASSWORD,
      name: '퇴사자',
      userType: 'CENTER',
      centerIds: [centerId],
    })
    await prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } })

    await expect(signIn('leaver')).rejects.toMatchObject({ message: ACCOUNT_DISABLED })
    expect(await prisma.session.count()).toBe(0)
  })

  it('운영사가 운영 중(ACTIVE)이 아니면 로그인할 수 없다 (0039)', async () => {
    await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'op.user',
      password: PASSWORD,
      name: '김운영',
      userType: 'OPERATOR',
    })
    for (const status of ['SUSPENDED', 'PENDING', 'TERMINATED']) {
      await prisma.operator.update({ where: { id: TEST_OPERATOR_ID }, data: { status } })
      await expect(signIn('op.user')).rejects.toMatchObject({ message: OPERATOR_DISABLED })
    }
    expect(await prisma.session.count()).toBe(0)

    await prisma.operator.update({ where: { id: TEST_OPERATOR_ID }, data: { status: 'ACTIVE' } })
    expect((await signIn('op.user'))?.user).toBeDefined()
  })

  it('플랫폼 관리자는 운영사 없이 만들고 로그인한다 (다른 유형은 운영사가 꼭 있어야 한다)', async () => {
    await createUserAccount({
      operatorId: null,
      username: 'platform1',
      password: PASSWORD,
      name: '플랫폼',
      userType: 'PLATFORM',
    })
    expect((await signIn('platform1'))?.user).toMatchObject({ userType: 'PLATFORM' })

    await expect(
      createUserAccount({
        operatorId: null,
        username: 'nobody',
        password: PASSWORD,
        name: '소속 없음',
        userType: 'OPERATOR',
      }),
    ).rejects.toThrow('플랫폼 관리자만')
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: 'platform2',
        password: PASSWORD,
        name: '운영사 있는 플랫폼',
        userType: 'PLATFORM',
      }),
    ).rejects.toThrow('플랫폼 관리자만')
    // DB 검사 조건도 같은 규칙을 지킨다
    await expect(
      prisma.user.create({
        data: { name: 'x', email: 'x@users.local', username: 'x', userType: 'CENTER' },
      }),
    ).rejects.toThrow()
  })

  it('아이디는 대소문자를 구분하지 않는다', async () => {
    await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'Kim.Worker',
      password: PASSWORD,
      name: '김작업',
      userType: 'SHIPPER',
      shipperId,
    })
    const result = await signIn('KIM.WORKER')
    expect(result?.user).toMatchObject({ username: 'kim.worker' })
  })

  it('같은 아이디로 두 번 만들 수 없다 (대소문자만 달라도)', async () => {
    await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'dup',
      password: PASSWORD,
      name: '중복',
      userType: 'CENTER',
      centerIds: [centerId],
    })
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: 'DUP',
        password: PASSWORD,
        name: '중복2',
        userType: 'CENTER',
        centerIds: [centerId],
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('규칙에 맞지 않는 아이디·짧은 비밀번호는 거부한다', async () => {
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: '한글아이디',
        password: PASSWORD,
        name: 'x',
        userType: 'CENTER',
        centerIds: [centerId],
      }),
    ).rejects.toThrow(/아이디/)
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: 'short',
        password: '1234',
        name: 'x',
        userType: 'CENTER',
        centerIds: [centerId],
      }),
    ).rejects.toThrow(/8자 이상/)
  })

  it('센터 직원은 소속 센터가, 화주사 사용자는 소속 화주사가 있어야 한다', async () => {
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: 'nocenter',
        password: PASSWORD,
        name: 'x',
        userType: 'CENTER',
      }),
    ).rejects.toThrow(/소속 센터를 1개 이상/)
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: 'noship',
        password: PASSWORD,
        name: 'x',
        userType: 'SHIPPER',
      }),
    ).rejects.toThrow(/소속 화주사/)
  })

  it('다른 유형의 소속은 가질 수 없다 (운영사에게 화주사, 화주사 사용자에게 센터)', async () => {
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: 'op1',
        password: PASSWORD,
        name: 'x',
        userType: 'OPERATOR',
        shipperId,
      }),
    ).rejects.toThrow(/화주사 사용자만/)
    await expect(
      createUserAccount({
        operatorId: TEST_OPERATOR_ID,
        username: 'sh1',
        password: PASSWORD,
        name: 'x',
        userType: 'SHIPPER',
        shipperId,
        centerIds: [centerId],
      }),
    ).rejects.toThrow(/센터 직원만/)
  })

  it('센터 직원은 여러 센터에 소속될 수 있다', async () => {
    const second = await createTestCenter('PUS')
    const user = await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'multi',
      password: PASSWORD,
      name: '두센터',
      userType: 'CENTER',
      centerIds: [centerId, second.id, centerId],
    })
    expect(await prisma.userCenter.count({ where: { userId: user.id } })).toBe(2)
  })

  it('DB 검사 조건: 프로그램을 거치지 않아도 화주사 소속 규칙이 지켜진다', async () => {
    const user = await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'ship2',
      password: PASSWORD,
      name: 'x',
      userType: 'SHIPPER',
      shipperId,
    })
    // 화주사 사용자의 화주사 연결을 지우려 하면 DB가 거부
    await expect(
      prisma.user.update({ where: { id: user.id }, data: { shipperId: null } }),
    ).rejects.toThrow(/user_shipper_matches_type/)
    // 화주사 사용자를 운영사로 바꾸면서 화주사 연결을 남기면 DB가 거부
    await expect(
      prisma.user.update({ where: { id: user.id }, data: { userType: 'OPERATOR' } }),
    ).rejects.toThrow(/user_shipper_matches_type/)
  })
})
