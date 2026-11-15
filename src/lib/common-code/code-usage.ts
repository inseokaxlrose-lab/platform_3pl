import 'server-only'
import type { Prisma } from '@/generated/prisma/client'

type Db = Prisma.TransactionClient

// 공통코드가 어느 업무 표에서 쓰이는지 (docs/decisions/0030)
// 그룹 코드 → "이 코드를 쓰는 행 수"를 세는 함수. 공통코드를 쓰는 칸을 새로 만들면 여기에 등록한다
// 등록돼 있지 않은 그룹은 아직 아무 표도 쓰지 않는다는 뜻 → 코드를 자유롭게 지울 수 있다
const CODE_USAGES: Record<string, (db: Db, code: string) => Promise<number>> = {}

// 이 코드를 쓰는 행 수 (지울 수 있는지 확인용)
export async function countCodeUsage(db: Db, groupCode: string, code: string) {
  const count = CODE_USAGES[groupCode]
  return count ? count(db, code) : 0
}
