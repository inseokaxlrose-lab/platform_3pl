import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toStatus } from '@/lib/status'
import { toYn } from '@/lib/yn'
import { isPasswordSameAsUsername, passwordSchema, SAME_AS_USERNAME_MESSAGE } from './user-schema'

// 비밀번호 초기화 (관리자): 새 비밀번호를 Better Auth 방식으로 암호화해 저장하고, 로그인을 모두 끊는다
// 관리자가 정한 비밀번호는 임시 비밀번호 → 다음 로그인 때 사용자가 바꿔야 한다 (0086)
export async function resetUserPassword(userId: bigint, newPassword: string) {
  const password = passwordSchema.parse(newPassword)
  const context = await auth.$context
  const passwordHash = await context.password.hash(password)

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { username: true } })
    if (target?.username && isPasswordSameAsUsername(password, target.username)) {
      throw new ActionError('VALIDATION', SAME_AS_USERNAME_MESSAGE)
    }
    const updated = await tx.account.updateMany({
      where: { userId, providerId: 'credential' },
      data: { password: passwordHash },
    })
    if (updated.count === 0) throw new Error('아이디·비밀번호 로그인 수단이 없는 사용자입니다.')
    await tx.user.update({ where: { id: userId }, data: { passwordChangeReqYn: toYn(true) } })
    // 유출 대응: 기존 로그인을 모두 끊는다
    await tx.session.deleteMany({ where: { userId } })
  })
}

// 본인 비밀번호 변경 (0086): 현재 비밀번호가 맞아야 바꾼다. 바꾸면 임시 비밀번호 표시를 풀고,
// 지금 쓰는 로그인(keepSessionId)만 남기고 다른 기기의 로그인은 끊는다
// 입력 모양(규칙·확인·현재와 다름)은 changePasswordSchema가 먼저 검사한다
export async function changeOwnPassword(
  userId: bigint,
  keepSessionId: string,
  currentPassword: string,
  newPassword: string,
) {
  const password = passwordSchema.parse(newPassword)
  const context = await auth.$context
  const account = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
    select: { id: true, password: true, user: { select: { username: true } } },
  })
  if (!account?.password) throw new Error('아이디·비밀번호 로그인 수단이 없는 사용자입니다.')
  const matches = await context.password.verify({
    password: currentPassword,
    hash: account.password,
  })
  if (!matches) throw new ActionError('VALIDATION', '현재 비밀번호가 맞지 않습니다.')
  if (account.user.username && isPasswordSameAsUsername(password, account.user.username)) {
    throw new ActionError('VALIDATION', SAME_AS_USERNAME_MESSAGE)
  }
  const passwordHash = await context.password.hash(password)
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: account.id }, data: { password: passwordHash } })
    await tx.user.update({ where: { id: userId }, data: { passwordChangeReqYn: toYn(false) } })
    await tx.session.deleteMany({ where: { userId, NOT: { id: BigInt(keepSessionId) } } })
  })
}

// 사용 중지 / 다시 사용: 사용 중지하면 로그인을 즉시 끊는다
export async function setUserActive(userId: bigint, isActive: boolean) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: toStatus(isActive) } })
    if (!isActive) await tx.session.deleteMany({ where: { userId } })
  })
}
