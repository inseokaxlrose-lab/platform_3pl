import 'server-only'
import { prisma, type Db } from '@/lib/prisma'
import { ACTIVE_ONLY, NOT_DELETED } from '@/lib/status'
import { matchRegion, pickDeliveryZone, type ZoneCandidate } from './routing'

// 배송 센터 자동 배정 (docs/decisions/0072) — 출고·수송 자동 분류에서 부른다
// 후보는 늘 그 화주사가 이용하는 센터(사용 중)의 사용 중인 권역만

export type DeliveryCenterResult =
  // ① 거래처에 지정한 배송 센터
  | { status: 'CUSTOMER'; centerId: string }
  // ②·③ 권역 규칙으로 정함
  | { status: 'AUTO'; centerId: string; zone: ZoneCandidate; candidates: ZoneCandidate[] }
  // ④ 동률 → 사람이 골라야 함
  | { status: 'PENDING'; candidates: ZoneCandidate[] }
  // 맞는 권역이 없음 (주소 없음 포함)
  | { status: 'NONE'; candidates: [] }

export async function resolveDeliveryCenter(
  input: { shipperId: bigint; customerId?: bigint; regionCode?: string | null },
  db: Db = prisma,
): Promise<DeliveryCenterResult> {
  // 화주사가 이용하는 사용 중인 센터
  const links = await db.shipperCenter.findMany({
    where: { shipperId: input.shipperId, center: { ...ACTIVE_ONLY, ...NOT_DELETED } },
    select: { centerId: true },
  })
  const centerIds = links.map((l) => l.centerId)

  const customer = input.customerId
    ? await db.customer.findUnique({
        where: { id: input.customerId },
        select: { deliveryCenterId: true, regionCode: true },
      })
    : null

  // ① 거래처 지정 (이용 센터·사용 중일 때만)
  if (customer?.deliveryCenterId && centerIds.includes(customer.deliveryCenterId)) {
    return { status: 'CUSTOMER', centerId: String(customer.deliveryCenterId) }
  }

  const region = (input.regionCode ?? customer?.regionCode ?? '').trim()
  if (region.length < 5 || centerIds.length === 0) return { status: 'NONE', candidates: [] }

  const keys = [region.slice(0, 5), region.slice(0, 2)]
  const zones = await db.deliveryZone.findMany({
    where: {
      ...ACTIVE_ONLY,
      centerId: { in: centerIds },
      regions: { some: { regionCode: { in: keys } } },
    },
    select: {
      id: true,
      name: true,
      priority: true,
      centerId: true,
      center: { select: { name: true } },
      regions: { where: { regionCode: { in: keys } }, select: { regionCode: true } },
    },
  })
  const candidates: ZoneCandidate[] = zones.flatMap((zone) => {
    const matched = matchRegion(
      zone.regions.map((r) => r.regionCode),
      region,
    )
    return matched
      ? [
          {
            zoneId: String(zone.id),
            zoneName: zone.name,
            centerId: String(zone.centerId),
            centerName: zone.center.name,
            matchedRegion: matched,
            priority: zone.priority,
          },
        ]
      : []
  })
  if (candidates.length === 0) return { status: 'NONE', candidates: [] }

  // ②·③
  const { picked, tied } = pickDeliveryZone(candidates)
  if (!picked) return { status: 'PENDING', candidates: tied }
  return { status: 'AUTO', centerId: picked.centerId, zone: picked, candidates }
}
