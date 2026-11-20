import 'server-only'
import { currentActor } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { regionZipRowsByCodes } from '@/lib/regions/region-queries'
import { TEMP_ZONE_ALL } from '@/lib/regions/region-codes'

// 코스 우편번호 배정 (docs/decisions/0095): 센터 안에서 우편번호 하나에 코스 하나
// - 같은 센터의 다른 코스에 있던 우편번호는 이 코스로 옮긴다 (미리보기에서 건수를 보여 준다)
// - 지역 마스터에 없거나 폐지된 우편번호는 넣지 않는다
// - 권역설정에서 다른 센터로 배정된 우편번호도 넣을 수는 있지만 미리보기에서 알린다

export type RouteRef = { id: bigint; operatorId: bigint; centerId: bigint }

export type RouteZipPlan = {
  // 새로 넣거나 옮길 우편번호
  zips: string[]
  // 이미 이 코스
  already: number
  // 다른 코스에서 옮겨 오는 것 (코스 코드별 건수)
  moves: { code: string; name: string; count: number }[]
  // 지역 마스터에 없거나 폐지
  unknown: string[]
  // 권역설정의 센터가 이 코스의 센터가 아님 (미배정 포함)
  outsideCenter: number
}

export async function planRouteZips(
  db: Db,
  route: RouteRef,
  wanted: string[],
): Promise<RouteZipPlan> {
  const zips = [...new Set(wanted)]
  const [master, current, region] = await Promise.all([
    db.regionZip.findMany({
      where: { code: { in: zips }, abolishedYn: 'N' },
      select: { code: true },
    }),
    db.routeZip.findMany({
      where: { centerId: route.centerId, zipCode: { in: zips } },
      select: { zipCode: true, routeId: true, route: { select: { code: true, name: true } } },
    }),
    regionZipRowsByCodes(db, route.operatorId, zips, TEMP_ZONE_ALL),
  ])
  const known = new Set(master.map((m) => m.code))
  const valid = zips.filter((z) => known.has(z))
  const byZip = new Map(current.map((c) => [c.zipCode, c]))
  const moves = new Map<string, { code: string; name: string; count: number }>()
  let already = 0
  const targets: string[] = []
  for (const zip of valid) {
    const now = byZip.get(zip)
    if (now?.routeId === route.id) {
      already++
      continue
    }
    if (now) {
      const move = moves.get(now.route.code) ?? { ...now.route, count: 0 }
      move.count++
      moves.set(now.route.code, move)
    }
    targets.push(zip)
  }
  const regionCenter = new Map(region.map((r) => [r.zipCode, r.centerId]))
  return {
    zips: targets,
    already,
    moves: [...moves.values()],
    unknown: zips.filter((z) => !known.has(z)),
    outsideCenter: targets.filter((z) => regionCenter.get(z) !== route.centerId).length,
  }
}

// 배정: 미리보기와 같은 계산을 다시 해서 넣는다 (그 사이 바뀐 것까지)
export async function assignRouteZips(route: RouteRef, wanted: string[]) {
  return prisma.$transaction(async (tx) => {
    const plan = await planRouteZips(tx, route, wanted)
    if (plan.zips.length > 0) {
      await tx.routeZip.deleteMany({
        where: { centerId: route.centerId, zipCode: { in: plan.zips } },
      })
      const assignedBy = currentActor()
      await tx.routeZip.createMany({
        data: plan.zips.map((zipCode) => ({
          operatorId: route.operatorId,
          centerId: route.centerId,
          routeId: route.id,
          zipCode,
          assignedBy,
        })),
      })
    }
    return plan
  })
}

// 빼기: 이 코스의 우편번호만
export async function unassignRouteZips(routeId: bigint, zips: string[]) {
  const { count } = await prisma.routeZip.deleteMany({
    where: { routeId, zipCode: { in: zips } },
  })
  return { count }
}

// 코스 화면의 우편번호 목록: 법정동 이름·권역설정 센터 (이 코스 센터와 다르면 화면이 알린다)
export async function listRouteZips(db: Db, route: RouteRef) {
  const rows = await db.routeZip.findMany({
    where: { routeId: route.id },
    orderBy: { zipCode: 'asc' },
    select: { zipCode: true, assignedAt: true, assignedBy: true },
  })
  const region = await regionZipRowsByCodes(
    db,
    route.operatorId,
    rows.map((r) => r.zipCode),
    TEMP_ZONE_ALL,
  )
  const info = new Map(region.map((r) => [r.zipCode, r]))
  return rows.map((row) => {
    const found = info.get(row.zipCode)
    return {
      ...row,
      bjdNames: found?.bjdNames ?? '',
      repAddress: found?.repAddress ?? null,
      abolished: found?.abolished ?? false,
      regionCenterName: found?.centerName ?? null,
      otherCenter: found?.centerId !== route.centerId,
    }
  })
}
