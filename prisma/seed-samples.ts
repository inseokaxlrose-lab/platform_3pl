// 개발용 견본 계정 정의 (prisma/seed.ts가 사용, docs/decisions/0020)
import { SUPER_GROUP_NAME } from '../src/config/defaults/roles'

type UserType = 'OPERATOR' | 'CENTER' | 'SHIPPER'

type SampleAccount = {
  username: string
  name: string
  userType: UserType
  group: string
  // 소속: 예시 센터·화주사 코드
  centerCodes?: string[]
  shipperCode?: string
}

// 역할별 견본 계정 (비밀번호는 .env의 SEED_SAMPLE_PASSWORD)
export const SAMPLE_ACCOUNTS: readonly SampleAccount[] = [
  { username: 'ops.admin', name: '운영 관리자', userType: 'OPERATOR', group: SUPER_GROUP_NAME },
  {
    username: 'center.manager',
    name: '이천 운영자',
    userType: 'CENTER',
    group: '센터 운영자',
    centerCodes: ['ICN'],
  },
  {
    username: 'center.worker',
    name: '이천 작업자',
    userType: 'CENTER',
    group: '센터 작업자',
    centerCodes: ['ICN'],
  },
  {
    username: 'shipper.user',
    name: '가나식품 담당자',
    userType: 'SHIPPER',
    group: '화주사 사용자',
    shipperCode: 'GANA',
  },
]
