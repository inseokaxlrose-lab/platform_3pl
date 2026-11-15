import 'server-only'
import { z } from 'zod'
import { passwordSchema, usernameSchema } from './user-schema'
import { auth } from '@/lib/auth'
import { prisma, type Tx } from '@/lib/prisma'
import { affiliationIssues, internalEmail } from './affiliation'

// 아이디 규칙: 영문·숫자·점·밑줄·하이픈 3~30자 (Better Auth username 플러그인 설정과 같게)
// 아이디·비밀번호 규칙은 화면과 함께 쓰는 user-schema.ts에 있다
export { passwordSchema, usernameSchema } from './user-schema'

// 서버 안에서만 부르므로 키는 bigint 그대로 받는다
const createUserAccountSchema = z
  .object({
    // 소속 운영사 (아이디는 운영사와 상관없이 전체에서 하나, 0039). 플랫폼 관리자만 null
    operatorId: z.bigint().nullable(),
    username: usernameSchema,
    password: passwordSchema,
    name: z.string().trim().min(1, '이름을 입력해 주세요.').max(50),
    userType: z.enum(['OPERATOR', 'CENTER', 'SHIPPER', 'PLATFORM']),
    // 이메일이 없으면 내부용 주소를 채운다 (Better Auth는 이메일 칸이 필수)
    email: z.email().optional(),
    // 소속 (데이터 범위 기준): 센터 직원 → 센터 1개 이상, 화주사 사용자 → 화주사 1개, 운영사 → 없음
    centerIds: z.array(z.bigint()).default([]),
    shipperId: z.bigint().optional(),
    // 배정할 권한그룹 (영역이 사용자 유형과 맞는지는 호출하는 쪽에서 확인)
    permissionGroupIds: z.array(z.bigint()).default([]),
  })
  .superRefine((data, ctx) => {
    // 플랫폼 관리자만 운영사가 없다 (DB 검사 조건 tb_user_operator_matches_type과 같은 규칙)
    if ((data.userType === 'PLATFORM') !== (data.operatorId === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['operatorId'],
        message: '플랫폼 관리자만 운영사 없이 만들 수 있습니다.',
      })
    }
    for (const issue of affiliationIssues(data.userType, data.centerIds, data.shipperId)) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message })
    }
  })

export type CreateUserAccountInput = z.input<typeof createUserAccountSchema>

// 계정 만들기: 사용자 + 암호화된 비밀번호를 한 트랜잭션으로 저장한다
// 회원가입을 꺼 두었으므로, 사용자 관리 화면·시드·운영사 등록에서 이 함수로만 계정을 만든다
// tx: 바깥 트랜잭션 안에서 만들 때 (운영사 등록 + 관리자 계정을 함께 만들거나 함께 취소)
export async function createUserAccount(input: CreateUserAccountInput, tx?: Tx) {
  const data = createUserAccountSchema.parse(input)
  // Better Auth와 같은 규칙: 아이디는 소문자로 저장해 대소문자를 구분하지 않는다
  const username = data.username.toLowerCase()

  // Better Auth 설정의 암호화 방식을 그대로 사용 (로그인 시 같은 방식으로 비교)
  const context = await auth.$context
  const passwordHash = await context.password.hash(data.password)

  const save = async (db: Tx) => {
    const user = await db.user.create({
      data: {
        operatorId: data.operatorId,
        name: data.name,
        email: data.email ? data.email.toLowerCase() : internalEmail(username),
        username,
        displayUsername: data.username,
        userType: data.userType,
        shipperId: data.shipperId,
        centers: { create: [...new Set(data.centerIds)].map((centerId) => ({ centerId })) },
        permissionGroups: {
          create: [...new Set(data.permissionGroupIds)].map((groupId) => ({ groupId })),
        },
      },
    })
    // 아이디·비밀번호 로그인 수단 (Better Auth 형식: providerId 'credential', accountId = 사용자 키 글자)
    // 키는 DB가 자동으로 매긴다 (generateId: 'serial')
    await db.account.create({
      data: {
        userId: user.id,
        accountId: String(user.id),
        providerId: 'credential',
        password: passwordHash,
      },
    })
    return user
  }
  return tx ? save(tx) : prisma.$transaction(save)
}
