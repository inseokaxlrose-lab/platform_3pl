import 'server-only'
import { formatSystemCode, SYSTEM_CODE_TYPES, type SystemCodeType } from '@/config/master-codes'
import { prisma, type Db } from '@/lib/prisma'

// DB 연결 타입 (등록과 같은 트랜잭션에서 번호를 받을 수 있게): prisma.ts의 Db
export type { Db } from '@/lib/prisma'

// 시스템 코드 발급 (docs/decisions/0025): 'CENTER' → 'CT000001'
// 종류별 DB 시퀀스라 동시에 여러 건을 등록해도 겹치지 않는다
// 시퀀스 이름은 설정 파일의 고정값만 쓴다 (사용자 입력이 SQL에 들어가지 않음)
export async function nextSystemCode(type: SystemCodeType, db: Db = prisma) {
  const { sequence } = SYSTEM_CODE_TYPES[type]
  const [row] = await db.$queryRawUnsafe<{ value: bigint }[]>(
    `SELECT nextval('"${sequence}"') AS value`,
  )
  return formatSystemCode(type, row.value)
}
