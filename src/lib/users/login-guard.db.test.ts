import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_LOCKED, auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTestCenter } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { createUserAccount } from './create-user-account'
import {
  checkLock,
  LOCK_THRESHOLD,
  recentLoginHistory,
  recordFailure,
  recordSuccess,
  unlockUser,
} from './login-guard'

// 로그인 실패 잠금·로그인 이력 (0093): 5회 연속 실패 → 30분 잠금
const PASSWORD = 'test-password-1234'
const CLIENT = { ip: '10.0.0.1', userAgent: 'vitest' }

let userId = 0n

beforeEach(async () => {
  await resetDatabase()
  const centerId = (await createTestCenter('ICN')).id
  userId = (
    await createUserAccount({
      operatorId: TEST_OPERATOR_ID,
      username: 'worker1',
      password: PASSWORD,
      name: '김작업',
      userType: 'CENTER',
      centerIds: [centerId],
    })
  ).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

// 실패를 n번 기록하고 마지막 결과(이번에 잠겼는지)를 돌려준다
async function failTimes(n: number) {
  let locked = false
  for (let i = 0; i < n; i++) locked = await recordFailure('worker1', CLIENT)
  return locked
}

describe('로그인 실패 잠금', () => {
  it('4번 틀리면 잠기지 않고 실패 수만 쌓인다', async () => {
    expect(await failTimes(LOCK_THRESHOLD - 1)).toBe(false)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.loginFailCount).toBe(4)
    expect(user.lockedUntil).toBeNull()
    expect(await checkLock('worker1', CLIENT)).toBeNull()
  })

  it('5번째에 30분 잠기고, 잠긴 동안은 맞는 비밀번호도 세션을 만들지 않는다', async () => {
    expect(await failTimes(LOCK_THRESHOLD)).toBe(true)
    const remaining = await checkLock('worker1', CLIENT)
    expect(remaining).toBeGreaterThanOrEqual(29)
    expect(remaining).toBeLessThanOrEqual(30)
    // 인증 API를 직접 불러도 세션 만들기에서 막힌다
    await expect(
      auth.api.signInUsername({ body: { username: 'worker1', password: PASSWORD } }),
    ).rejects.toThrow(ACCOUNT_LOCKED)
    expect(await prisma.session.count()).toBe(0)
  })

  it('잠금 시간이 지나면 다시 로그인할 수 있다', async () => {
    await failTimes(LOCK_THRESHOLD)
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    })
    expect(await checkLock('worker1', CLIENT)).toBeNull()
    const result = await auth.api.signInUsername({
      body: { username: 'worker1', password: PASSWORD },
    })
    expect(result?.token).toBeTruthy()
  })

  it('관리자가 잠금을 풀면 바로 로그인할 수 있다', async () => {
    await failTimes(LOCK_THRESHOLD)
    await unlockUser(userId)
    expect(await checkLock('worker1', CLIENT)).toBeNull()
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.loginFailCount).toBe(0)
    expect(user.lockedUntil).toBeNull()
  })

  it('성공하면 연속 실패 수가 0이 되고 마지막 로그인 일시·IP가 남는다', async () => {
    await failTimes(3)
    await recordSuccess(userId, 'worker1', CLIENT)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.loginFailCount).toBe(0)
    expect(user.lastLoginAt).not.toBeNull()
    expect(user.lastLoginIp).toBe('10.0.0.1')
    // 다시 4번 틀려도 잠기지 않는다 (연속 실패만 센다)
    expect(await failTimes(4)).toBe(false)
  })

  it('없는 아이디의 실패도 이력에 남지만 사용자와 운영사는 비어 있다', async () => {
    await recordFailure('nobody', CLIENT)
    const rows = await prisma.loginHist.findMany({ where: { username: 'nobody' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBeNull()
    expect(rows[0].operatorId).toBeNull()
    expect(rows[0].result).toBe('FAIL')
  })
})

describe('로그인 이력', () => {
  it('최근 것부터 결과·IP를 보여 준다', async () => {
    await failTimes(LOCK_THRESHOLD)
    await checkLock('worker1', CLIENT)
    const rows = await recentLoginHistory(userId)
    expect(rows).toHaveLength(LOCK_THRESHOLD + 1)
    expect(rows[0].result).toBe('LOCKED')
    expect(rows.every((row) => row.ipAddress === '10.0.0.1')).toBe(true)
    const hist = await prisma.loginHist.findFirstOrThrow({ where: { userId } })
    expect(hist.operatorId).toBe(TEST_OPERATOR_ID)
  })
})
