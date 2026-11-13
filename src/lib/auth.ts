import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { username } from 'better-auth/plugins'
import { prisma } from '@/lib/prisma'

// 사용 중지 계정 로그인 시 오류 메시지 (로그인 화면에서 이 값으로 구분한다)
export const ACCOUNT_DISABLED = 'ACCOUNT_DISABLED'

// 인증 설정 (Better Auth) — docs/decisions/0010-auth-and-permission-model.md
// - 로그인: 아이디 + 비밀번호 (현장 작업자는 이메일이 없을 수 있음)
// - 회원가입: 끔. 계정은 운영사 관리자가 사용자 관리 화면에서 만든다
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    // 우리가 추가한 사용자 정보 (사용자가 직접 바꿀 수 없음: input false)
    additionalFields: {
      // 데이터 범위 기준: OPERATOR(운영사) / CENTER(센터) / SHIPPER(화주사)
      userType: { type: 'string', required: true, input: false },
      // false면 로그인·사용 불가 (퇴사자 등). 계정을 지우지 않고 막는다
      isActive: { type: 'boolean', required: true, defaultValue: true, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // 로그인 직전 검사: 사용 중지된 계정(isActive = false)은 세션을 만들지 않는다
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          })
          if (!user?.isActive) {
            throw new APIError('FORBIDDEN', { message: ACCOUNT_DISABLED })
          }
        },
      },
    },
  },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    // 서버 액션에서 로그인 쿠키를 설정할 수 있게 한다 (반드시 마지막)
    nextCookies(),
  ],
})
