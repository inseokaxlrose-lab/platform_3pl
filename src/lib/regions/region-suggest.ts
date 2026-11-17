import 'server-only'
import type { Db } from '@/lib/prisma'
import { TEMP_ZONE_ALL } from './region-codes'

// 지역 마스터 갱신 배치 (docs/decisions/0076 "갱신") — 적재 스크립트가 적재 뒤에 부른다
// 1) 신규 우편번호: 같은 읍면동(주소가 가장 많은 법정동 기준)의 다른 우편번호가 가장 많이 배정된 센터를
//    운영사별로 '자동 추천'(확인 전)으로 배정. 그 읍면동이 미배정이면 미배정으로 둔다
// 2) 폐지 우편번호: 적재가 abolished_yn=Y로 표시하고 배정은 유지 (화면에 '폐지') → 영향 받는 배정 수만 센다

export type SuggestResult = {
  operatorId: bigint
  suggested: number
  // 폐지 우편번호인데 아직 배정이 남은 수 (화면에서 정리)
  abolishedAssigned: number
}

export async function suggestNewZips(db: Db, newZips: string[]): Promise<SuggestResult[]> {
  // 신규 우편번호 → 주소가 가장 많은 법정동의 읍면동(앞 8자리)
  const links = newZips.length
    ? await db.regionZipBjd.findMany({
        where: { zipCode: { in: newZips } },
        select: { zipCode: true, bjdCode: true, addressCount: true },
      })
    : []
  const emdOf = new Map<string, { emd: string; count: number }>()
  for (const l of links) {
    const prev = emdOf.get(l.zipCode)
    const count = l.addressCount ?? 0
    if (!prev || count > prev.count) {
      emdOf.set(l.zipCode, { emd: l.bjdCode.slice(0, 8), count })
    }
  }
  const emds = [...new Set([...emdOf.values()].map((e) => e.emd))]
  // 그 읍면동들의 다른(기존) 우편번호
  const siblings = emds.length
    ? await db.regionZipBjd.findMany({
        where: {
          OR: emds.map((emd) => ({ bjdCode: { startsWith: emd } })),
          zipCode: { notIn: newZips },
        },
        select: { zipCode: true, bjdCode: true },
      })
    : []
  const siblingsByEmd = new Map<string, Set<string>>()
  for (const s of siblings) {
    const set = siblingsByEmd.get(s.bjdCode.slice(0, 8)) ?? new Set<string>()
    set.add(s.zipCode)
    siblingsByEmd.set(s.bjdCode.slice(0, 8), set)
  }

  const operators = await db.regionCenterMap.findMany({
    distinct: ['operatorId'],
    select: { operatorId: true },
  })
  const results: SuggestResult[] = []
  for (const { operatorId } of operators) {
    const assigned = new Map(
      (
        await db.regionCenterMap.findMany({
          where: {
            operatorId,
            tempZone: TEMP_ZONE_ALL,
            zipCode: { in: [...new Set(siblings.map((s) => s.zipCode))] },
            center: { status: { in: ['ACTIVE', 'PREPARING'] } },
          },
          select: { zipCode: true, centerId: true },
        })
      ).map((m) => [m.zipCode, m.centerId]),
    )
    const already = new Set(
      (
        await db.regionCenterMap.findMany({
          where: { operatorId, tempZone: TEMP_ZONE_ALL, zipCode: { in: newZips } },
          select: { zipCode: true },
        })
      ).map((m) => m.zipCode),
    )
    const picks: { zipCode: string; centerId: bigint }[] = []
    for (const [zipCode, { emd }] of emdOf) {
      if (already.has(zipCode)) continue
      const counts = new Map<bigint, number>()
      for (const sibling of siblingsByEmd.get(emd) ?? []) {
        const centerId = assigned.get(sibling)
        if (centerId) counts.set(centerId, (counts.get(centerId) ?? 0) + 1)
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(a[0] - b[0]))[0]
      if (best) picks.push({ zipCode, centerId: best[0] })
    }

    if (picks.length > 0) {
      const batch = await db.regionChangeBatch.create({
        data: {
          operatorId,
          changeType: 'SUGGEST',
          scopeDesc: `신규 우편번호 ${picks.length}건 자동 추천 (같은 읍면동의 가장 많은 배정 센터)`,
          tempZone: TEMP_ZONE_ALL,
          changedCount: picks.length,
        },
      })
      await db.regionCenterMap.createMany({
        data: picks.map((p) => ({
          operatorId,
          zipCode: p.zipCode,
          tempZone: TEMP_ZONE_ALL,
          centerId: p.centerId,
          assignType: 'SUGGESTED',
          confirmYn: 'N',
          lastBatchId: batch.id,
        })),
      })
      await db.regionCenterMapHist.createMany({
        data: picks.map((p) => ({
          batchId: batch.id,
          operatorId,
          zipCode: p.zipCode,
          tempZone: TEMP_ZONE_ALL,
          beforeCenterId: null,
          afterCenterId: p.centerId,
        })),
      })
    }
    const abolishedAssigned = await db.regionCenterMap.count({
      where: { operatorId, zip: { abolishedYn: 'Y' } },
    })
    results.push({ operatorId, suggested: picks.length, abolishedAssigned })
  }
  return results
}
