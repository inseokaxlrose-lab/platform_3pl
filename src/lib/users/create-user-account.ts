import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 아이디 규칙: 영문·숫자·점·밑줄·하이픈 3~30자 (Better Auth username 플러그인 설정과 같게)
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{3,30}$/, '아이디는 영문·숫자·점·밑줄·하이픈 3~30자입니다.')

export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상입니다.')
  .max(128, '비밀번호는 128자 이하입니다.')

const createUserAccountSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, '이름을 입력해 주세요.').max(50),
  userType: z.enum(['OPERATOR', 'CENTER', 'SHIPPER']),
  // 이메일이 없으면 내부용 주소를 채운다 (Better Auth는 이메일 칸이 필수)
  email: z.email().optional(),
})

export type CreateUserAccountInput = z.input<typeof createUserAccountSchema>

// 계정 만들기: 사용자 + 암호화된 비밀번호를 한 트랜잭션으로 저장한다
// 회원가입을 꺼 두었으므로, 사용자 관리 화면·시드에서 이 함수로만 계정을 만든다
export async function createUserAccount(input: CreateUserAccountInput) {
  const data = createUserAccountSchema.parse(input)
  // Better Auth와 같은 규칙: 아이디는 소문자로 저장해 대소문자를 구분하지 않는다
  const username = data.username.toLowerCase()
  const userId = randomUUID()

  // Better Auth 설정의 암호화 방식을 그대로 사용 (로그인 시 같은 방식으로 비교)
  const context = await auth.$context
  const passwordHash = await context.password.hash(data.password)

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: userId,
        name: data.name,
        email: (data.email ?? `${username}@users.local`).toLowerCase(),
        username,
        displayUsername: data.username,
        userType: data.userType,
      },
    })
    // 아이디·비밀번호 로그인 수단 (Better Auth 형식: providerId 'credential', accountId = 사용자 id)
    await tx.account.create({
      data: {
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: 'credential',
        password: passwordHash,
      },
    })
    return user
  })
}
