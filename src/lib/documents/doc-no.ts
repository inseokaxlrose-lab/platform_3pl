import 'server-only'
import { requireOperatorId } from '@/lib/actor'
import { issueCode } from '@/lib/numbering/numbering'
import { prisma, type Db } from '@/lib/prisma'

// 업무 문서 번호 발급 (docs/decisions/0047 → 0084 체번): 'ASN' → 'AS261120-0001'
// 운영사마다, 등록일(운영사 타임존)마다 1부터 — 모양은 체번 규칙(tb_numbering_rule)이 정한다
// 등록과 같은 트랜잭션(db)에서 받는다 (실패하면 결번이 생길 수 있음 — 허용)
export type DocumentNumberType = 'ASN' | 'RECEIPT' | 'LABEL' | 'ADJUST'

export async function nextDocumentNumber(
  type: DocumentNumberType,
  db: Db = prisma,
  at = new Date(),
) {
  return issueCode(db, type, { operatorId: requireOperatorId(), at })
}
