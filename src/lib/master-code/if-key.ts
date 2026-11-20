import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import type { Db } from '@/lib/prisma'

// 연동 조회 키 (docs/decisions/0084, 정의서 5-1·5-5 resolveByKey)
// 화주사마다 연동(API·엑셀 업로드)에서 거래처·납품처·품목을 무엇으로 찾을지 정한다
//   CODE    = 우리 코드(*_cd: 거래처코드·품목코드 — 직접 넣었거나 자동 체번)
//   CUST_CD = 사용자 정의 코드(*_cust_cd: 화주 시스템의 코드)
export type IfKeyType = 'CODE' | 'CUST_CD'

export async function shipperIfKeyType(db: Db, shipperId: bigint): Promise<IfKeyType> {
  const shipper = await db.shipper.findUnique({
    where: { id: shipperId },
    select: { ifKeyType: true },
  })
  if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
  return shipper.ifKeyType === 'CUST_CD' ? 'CUST_CD' : 'CODE'
}

// 키 → 조회 조건 (거래처·납품처·품목 공용: 칸 이름이 code / custCode로 같다)
export function keyWhere(keyType: IfKeyType, key: string) {
  return keyType === 'CUST_CD' ? { custCode: key } : { code: key }
}

// 키 이름 (오류 문구용)
export const keyLabel = (keyType: IfKeyType, entity: '거래처' | '납품처' | '품목') =>
  keyType === 'CUST_CD' ? `${entity} 사용자 정의 코드` : `${entity}코드`
