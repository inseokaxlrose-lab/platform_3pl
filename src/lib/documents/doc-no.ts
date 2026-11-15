import 'server-only'
import {
  DOCUMENT_NUMBER_TYPES,
  formatDocumentNumber,
  type DocumentNumberType,
} from '@/config/document-numbers'
import { prisma, type Db } from '@/lib/prisma'

// 업무 문서 번호 발급 (docs/decisions/0047): 'ASN' → 'AS261116-00001'
// 종류별 DB 시퀀스라 동시에 여러 건을 등록해도 겹치지 않는다
// 시퀀스 이름은 설정 파일의 고정값만 쓴다 (사용자 입력이 SQL에 들어가지 않음)
export async function nextDocumentNumber(
  type: DocumentNumberType,
  db: Db = prisma,
  at = new Date(),
) {
  const { sequence } = DOCUMENT_NUMBER_TYPES[type]
  const [row] = await db.$queryRawUnsafe<{ value: bigint }[]>(
    `SELECT nextval('"${sequence}"') AS value`,
  )
  return formatDocumentNumber(type, row.value, at)
}
