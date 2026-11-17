import 'server-only'
import { requireOperatorId } from '@/lib/actor'
import type { Db } from '@/lib/prisma'

// 공통코드가 어느 업무 표에서 쓰이는지 (docs/decisions/0030)
// 그룹 코드 → "이 코드를 쓰는 행 수"를 세는 함수. 공통코드를 쓰는 칸을 새로 만들면 여기에 등록한다
// 등록돼 있지 않은 그룹은 아직 아무 표도 쓰지 않는다는 뜻 → 코드를 자유롭게 지울 수 있다
// 공통코드는 운영사마다 따로라, 같은 운영사의 행만 센다 (0039)
type CountUsage = (db: Db, operatorId: bigint, code: string) => Promise<number>
const CODE_USAGES: Record<string, CountUsage> = {
  // 담당 업무: 운영사·화주사·거래처 담당자
  CONTACT_ROLE: async (db, operatorId, code) =>
    (await db.operatorContact.count({ where: { operatorId, duty: code } })) +
    (await db.shipperContact.count({ where: { shipper: { operatorId }, duty: code } })) +
    (await db.customerContact.count({ where: { customer: { operatorId }, duty: code } })),
  // 센터 담당 업무: 센터 담당자 (0073)
  CENTER_CONTACT_ROLE: async (db, operatorId, code) =>
    db.centerContact.count({ where: { center: { operatorId }, duty: code } }),
  // 보관 방식: 창고 (0074)
  STORAGE_METHOD: async (db, operatorId, code) =>
    db.warehouse.count({ where: { operatorId, storageMethod: code } }),
  // 구역·로케이션 (0075)
  ZONE_TYPE: async (db, operatorId, code) => db.zone.count({ where: { operatorId, type: code } }),
  LOC_TYPE: async (db, operatorId, code) =>
    db.location.count({ where: { operatorId, locType: code } }),
  LOCK_REASON: async (db, operatorId, code) =>
    db.location.count({ where: { operatorId, lockReason: code } }),
  ABC_CLASS: async (db, operatorId, code) =>
    db.location.count({ where: { operatorId, abcClass: code } }),
  // 제공 서비스: 운영사 (0040)
  SERVICE_TYPE: async (db, operatorId, code) =>
    db.operatorService.count({ where: { operatorId, serviceCd: code } }),
}

// 지금 운영사에서 이 코드를 쓰는 행 수 (지울 수 있는지 확인용)
export async function countCodeUsage(db: Db, groupCode: string, code: string) {
  const count = CODE_USAGES[groupCode]
  return count ? count(db, requireOperatorId(), code) : 0
}
