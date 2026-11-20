import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { username } from 'better-auth/plugins'
import { prisma } from '@/lib/prisma'
import { isOperatorActive } from '@/lib/operator/operator-status'
import { isActiveStatus } from '@/lib/status'
import { isShipperInScopeStatus } from '@/lib/shippers/shipper-codes'

// 사용 중지 계정 로그인 시 오류 메시지 (로그인 화면에서 이 값으로 구분한다)
export const ACCOUNT_DISABLED = 'ACCOUNT_DISABLED'
// 운영사가 운영 중(ACTIVE)이 아닐 때 (대기·정지·해지, 0039)
export const OPERATOR_DISABLED = 'OPERATOR_DISABLED'
// 화주사 사용자의 화주사가 해지됐을 때 (0080)
export const SHIPPER_DISABLED = 'SHIPPER_DISABLED'
// 로그인 실패가 쌓여 잠겼을 때 (0093)
export const ACCOUNT_LOCKED = 'ACCOUNT_LOCKED'

// 인증 설정 (Better Auth) — docs/decisions/0010-auth-and-permission-model.md
// - 로그인: 아이디 + 비밀번호 (현장 작업자는 이메일이 없을 수 있음)
// - 회원가입: 끔. 계정은 운영사 관리자가 사용자 관리 화면에서 만든다
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  advanced: {
    database: {
      // 키는 DB가 매기는 BIGINT 자동 증가 (docs/db-conventions.md). Better Auth는 글자로 돌려준다 ('12')
      generateId: 'serial',
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    // 우리가 추가한 사용자 정보 (사용자가 직접 바꿀 수 없음: input false)
    additionalFields: {
      // 데이터 범위 기준: OPERATOR(운영사) / CENTER(센터) / SHIPPER(화주사)
      userType: { type: 'string', required: true, input: false },
      // 상태 'ACTIVE'만 로그인·사용 가능, 'INACTIVE'는 막는다 (퇴사자 등, 계정은 지우지 않음)
      status: { type: 'string', required: true, defaultValue: 'ACTIVE', input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // 로그인 직전 검사: 사용 중지된 계정(status 'INACTIVE')은 세션을 만들지 않는다
        // 운영사가 운영 중이 아니어도 막는다 (플랫폼 관리자는 운영사가 없다)
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: BigInt(session.userId) },
            select: {
              status: true,
              lockedUntil: true,
              userType: true,
              operator: { select: { status: true } },
              shipper: { select: { status: true } },
            },
          })
          if (!user || !isActiveStatus(user.status)) {
            throw new APIError('FORBIDDEN', { message: ACCOUNT_DISABLED })
          }
          // 잠긴 계정: 맞는 비밀번호여도 세션을 만들지 않는다 (인증 API를 직접 불러도, 0093)
          if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new APIError('FORBIDDEN', { message: ACCOUNT_LOCKED })
          }
          if (user.userType !== 'PLATFORM' && !isOperatorActive(user.operator?.status)) {
            throw new APIError('FORBIDDEN', { message: OPERATOR_DISABLED })
          }
          // 화주사 사용자: 화주사가 해지되면 로그인할 수 없다 (일시정지는 조회만 가능)
          if (user.userType === 'SHIPPER' && !isShipperInScopeStatus(user.shipper?.status ?? '')) {
            throw new APIError('FORBIDDEN', { message: SHIPPER_DISABLED })
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
