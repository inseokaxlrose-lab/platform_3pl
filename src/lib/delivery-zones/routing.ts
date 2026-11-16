import { isWholeSido, regionLabel, regionsOverlap } from './regions'

// 배송 센터 자동 배정 규칙 (docs/decisions/0072) — 화면·서버 공용 순수 함수
// 위에서부터, 먼저 정해지는 단계에서 끝:
//   ① 거래처 지정 배송 센터 (resolve-delivery-center.ts)
//   ② 더 구체적인 지역 우선: 시·군·구(5자리)로 지정한 권역 > 시·도 전체(2자리)
//   ③ 권역 우선순위 번호가 작은 쪽
//   ④ 그래도 못 정하면 배정 대기 (후보 목록과 함께)

export const DEFAULT_ZONE_PRIORITY = 100

// 지역 코드의 구체성: 시·군·구 2, 시·도 전체 1
export const regionSpecificity = (code: string) => (isWholeSido(code) ? 1 : 2)

// 주소의 법정동 코드(10자리, 앞 5자리 = 시·군·구, 앞 2자리 = 시·도)에 맞는 권역 지역 중 가장 구체적인 것
export function matchRegion(zoneRegions: readonly string[], addressRegion: string): string | null {
  const sigungu = addressRegion.slice(0, 5)
  const sido = addressRegion.slice(0, 2)
  if (zoneRegions.includes(sigungu)) return sigungu
  if (zoneRegions.includes(sido)) return sido
  return null
}

export type ZoneCandidate = {
  zoneId: string
  zoneName: string
  centerId: string
  centerName: string
  // 이 주소에 걸린 권역의 지역 (예: '11680' 강남구, '11' 서울 전체)
  matchedRegion: string
  priority: number
}

// ②·③: 후보 중 하나를 고른다. 동률이면 picked = null, tied = 동률 후보들 (배정 대기)
export function pickDeliveryZone(candidates: readonly ZoneCandidate[]): {
  picked: ZoneCandidate | null
  tied: ZoneCandidate[]
} {
  if (candidates.length === 0) return { picked: null, tied: [] }
  const sorted = [...candidates].sort(
    (a, b) =>
      regionSpecificity(b.matchedRegion) - regionSpecificity(a.matchedRegion) ||
      a.priority - b.priority,
  )
  const best = sorted[0]
  const tied = sorted.filter(
    (c) =>
      regionSpecificity(c.matchedRegion) === regionSpecificity(best.matchedRegion) &&
      c.priority === best.priority,
  )
  // 동률이어도 모두 같은 센터면 센터는 정해진다 (같은 센터 안 권역은 겹칠 수 없어 드문 경우)
  if (tied.length === 1 || new Set(tied.map((c) => c.centerId)).size === 1) {
    return { picked: best, tied: [] }
  }
  return { picked: null, tied }
}

// 배송권역 화면 안내: 이 권역과 다른 센터 권역이 겹치는 곳마다 어느 쪽이 우선인지
export type OtherZoneRegion = {
  regionCode: string
  zoneName: string
  centerName: string
  priority: number
}

export type OverlapNotice = {
  // 겹치는 곳 (더 좁은 쪽 지역)
  region: string
  label: string
  other: { zoneName: string; centerName: string; regionCode: string }
  winner: 'THIS' | 'OTHER' | 'TIE'
  message: string
}

export function describeOverlaps(
  mine: { regionCodes: readonly string[]; priority: number },
  others: readonly OtherZoneRegion[],
): OverlapNotice[] {
  const notices: OverlapNotice[] = []
  for (const code of mine.regionCodes) {
    for (const other of others) {
      if (!regionsOverlap(code, other.regionCode)) continue
      // 겹치는 곳은 더 좁은 쪽 (서울 전체 × 강남구 → 강남구)
      const region =
        regionSpecificity(code) >= regionSpecificity(other.regionCode) ? code : other.regionCode
      const mineSpec = regionSpecificity(code)
      const otherSpec = regionSpecificity(other.regionCode)
      const winner: OverlapNotice['winner'] =
        mineSpec !== otherSpec
          ? mineSpec > otherSpec
            ? 'THIS'
            : 'OTHER'
          : mine.priority !== other.priority
            ? mine.priority < other.priority
              ? 'THIS'
              : 'OTHER'
            : 'TIE'
      const otherName = `${other.centerName} '${other.zoneName}'(${regionLabel(other.regionCode)})`
      const reason =
        mineSpec !== otherSpec
          ? '더 구체적인 지역이 우선'
          : `우선순위 ${mine.priority} / ${other.priority}`
      const message =
        winner === 'THIS'
          ? `${otherName}와 겹침 → 이 권역이 우선 (${reason})`
          : winner === 'OTHER'
            ? `${otherName}와 겹침 → 상대 권역이 우선 (${reason})`
            : `${otherName}와 겹침 → 우선순위가 같아(${mine.priority}) 배정 대기가 됩니다. 우선순위 번호를 다르게 정해 주세요`
      notices.push({
        region,
        label: regionLabel(region),
        other: {
          zoneName: other.zoneName,
          centerName: other.centerName,
          regionCode: other.regionCode,
        },
        winner,
        message,
      })
    }
  }
  return notices
}
