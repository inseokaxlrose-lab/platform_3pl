import 'server-only'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { passwordSchema } from './create-user-account'

// 비밀번호 초기화: 새 비밀번호를 Better Auth 방식으로 암호화해 저장하고, 로그인을 모두 끊는다
export async function resetUserPassword(userId: string, newPassword: string) {
  const password = passwordSchema.parse(newPassword)
  const context = await auth.$context
  const passwordHash = await context.password.hash(password)

  await prisma.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: { userId, providerId: 'credential' },
      data: { password: passwordHash },
    })
    if (updated.count === 0) throw new Error('아이디·비밀번호 로그인 수단이 없는 사용자입니다.')
    // 유출 대응: 기존 로그인을 모두 끊는다
    await tx.session.deleteMany({ where: { userId } })
  })
}

// 사용 중지 / 다시 사용: 사용 중지하면 로그인을 즉시 끊는다
export async function setUserActive(userId: string, isActive: boolean) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive } })
    if (!isActive) await tx.session.deleteMany({ where: { userId } })
  })
}
