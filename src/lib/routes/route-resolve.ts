import 'server-only'
import type { Db } from '@/lib/prisma'

// 납품처의 배송 코스 정하기 (docs/decisions/0095)
// 1. 납품처에 직접 지정한 코스 — 배송센터의 코스이고 사용 중일 때만
// 2. 배송센터 + 우편번호의 코스 배정 (tb_route_zip) — 사용 중인 코스만
// 3. 없으면 코스 없음
// 코스는 저장해 두지 않고 그때그때 정한다 (배송센터·우편번호·배정이 바뀌어도 따로 맞출 일이 없다)

export type ShipToRouteInput = {
  routeId: bigint | null
  deliveryCenterId: bigint | null
  zipCode: string | null
}

export type ResolvedRoute = {
  id: bigint
  code: string
  name: string
  // MANUAL 직접 지정 / ZIP 우편번호 배정
  by: 'MANUAL' | 'ZIP'
}

// 여러 납품처를 한 번에 (목록용: 쿼리 2번)
export async function resolveShipToRoutes(
  db: Db,
  rows: readonly ShipToRouteInput[],
): Promise<(ResolvedRoute | null)[]> {
  const manualIds = [...new Set(rows.flatMap((r) => (r.routeId === null ? [] : [r.routeId])))]
  const pairs = rows.filter((r) => r.deliveryCenterId !== null && r.zipCode)
  const [manual, byZip] = await Promise.all([
    manualIds.length === 0
      ? []
      : db.route.findMany({
          where: { id: { in: manualIds }, status: 'ACTIVE' },
          select: { id: true, code: true, name: true, centerId: true },
        }),
    pairs.length === 0
      ? []
      : db.routeZip.findMany({
          where: {
            OR: pairs.map((p) => ({ centerId: p.deliveryCenterId!, zipCode: p.zipCode! })),
            route: { status: 'ACTIVE', delYn: 'N' },
          },
          select: {
            centerId: true,
            zipCode: true,
            route: { select: { id: true, code: true, name: true } },
          },
        }),
  ])
  const manualById = new Map(manual.map((m) => [m.id, m]))
  const zipKey = (centerId: bigint, zip: string) => `${centerId}:${zip}`
  const zipMap = new Map(byZip.map((z) => [zipKey(z.centerId, z.zipCode), z.route]))
  return rows.map((row) => {
    const own = row.routeId === null ? undefined : manualById.get(row.routeId)
    if (own && own.centerId === row.deliveryCenterId) {
      return { id: own.id, code: own.code, name: own.name, by: 'MANUAL' }
    }
    if (row.deliveryCenterId === null || !row.zipCode) return null
    const found = zipMap.get(zipKey(row.deliveryCenterId, row.zipCode))
    return found ? { ...found, by: 'ZIP' } : null
  })
}
