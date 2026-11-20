import 'server-only'
import type { LoginResult } from '@/config/db-codes'
import { prisma } from '@/lib/prisma'

// 로그인 실패 잠금·로그인 이력 (docs/decisions/0093, 사용자 결정: 5회 연속 실패 → 30분 잠금)
// - 실패: 있는 아이디면 연속 실패 수 +1, 5회가 되면 30분 잠금
// - 성공: 실패 수 0, 잠금 풀림, 마지막 로그인 일시·IP
// - 잠긴 동안은 맞는 비밀번호여도 로그인되지 않는다 (세션 만들기 직전에도 auth.ts가 다시 막는다)
// - 관리자는 사용자 화면에서 바로 풀 수 있다 (unlockUser)

export const LOCK_THRESHOLD = 5
export const LOCK_MINUTES = 30

export type LoginClient = { ip: string | null; userAgent: string | null }

// 요청 머리글에서 접속 IP·브라우저 (프록시 뒤면 x-forwarded-for의 첫 값)
export function clientOf(headers: Headers): LoginClient {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = (forwarded || headers.get('x-real-ip') || '').slice(0, 45) || null
  return { ip, userAgent: headers.get('user-agent')?.slice(0, 300) || null }
}

export const isLocked = (lockedUntil: Date | null, now = new Date()) =>
  lockedUntil !== null && lockedUntil > now

const findUser = (username: string) =>
  prisma.user.findUnique({
    where: { username: username.trim().toLowerCase() },
    select: { id: true, operatorId: true, lockedUntil: true, loginFailCount: true },
  })

async function record(
  username: string,
  result: LoginResult,
  client: LoginClient,
  user: { id: bigint; operatorId: bigint | null } | null,
) {
  await prisma.loginHist.create({
    data: {
      userId: user?.id ?? null,
      operatorId: user?.operatorId ?? null,
      username: username.trim().toLowerCase().slice(0, 50),
      result,
      ipAddress: client.ip,
      userAgent: client.userAgent,
    },
  })
}

// 로그인 전에: 잠겨 있으면 남은 분을 돌려주고 이력(LOCKED)을 남긴다
export async function checkLock(username: string, client: LoginClient): Promise<number | null> {
  const user = await findUser(username)
  if (!user || !isLocked(user.lockedUntil)) return null
  await record(username, 'LOCKED', client, user)
  return Math.max(1, Math.ceil((user.lockedUntil!.getTime() - Date.now()) / 60_000))
}

// 비밀번호가 틀렸을 때: 실패 수 +1, 기준에 닿으면 잠금. 이번에 잠겼으면 true
export async function recordFailure(username: string, client: LoginClient): Promise<boolean> {
  const user = await findUser(username)
  await record(username, 'FAIL', client, user)
  if (!user) return false
  const count = user.loginFailCount + 1
  const lock = count >= LOCK_THRESHOLD
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginFailCount: lock ? 0 : count,
      lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
    },
  })
  return lock
}

// 로그인 성공: 실패 수·잠금을 풀고 마지막 로그인을 남긴다
export async function recordSuccess(userId: bigint, username: string, client: LoginClient) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { loginFailCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: client.ip },
    select: { id: true, operatorId: true },
  })
  await record(username, 'SUCCESS', client, user)
}

// 사용 중지·운영사 정지 등으로 막혔을 때
export async function recordBlocked(
  username: string,
  result: 'LOCKED' | 'DISABLED',
  client: LoginClient,
) {
  await record(username, result, client, await findUser(username))
}

// 관리자가 잠금 풀기
export async function unlockUser(userId: bigint) {
  await prisma.user.update({
    where: { id: userId },
    data: { loginFailCount: 0, lockedUntil: null },
  })
}

// 사용자 화면의 최근 로그인 이력
export async function recentLoginHistory(userId: bigint, take = 20) {
  return prisma.loginHist.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, result: true, ipAddress: true, userAgent: true, createdAt: true },
  })
}
