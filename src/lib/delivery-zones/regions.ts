import { SIDO_LIST, SIGUNGU_LIST } from '@/config/korea-regions'

// 담당 지역 코드 다루기 (화면·서버 공용 순수 함수, docs/decisions/0033)
// 코드: 시·도 2자리 = "그 시·도 전체", 시·군·구 5자리 = 그 시·군·구

const sidoByCode = new Map(SIDO_LIST.map((s) => [s.code, s]))
const sigunguByCode = new Map(SIGUNGU_LIST.map((s) => [s.code, s]))

export const isRegionCode = (code: string) => sidoByCode.has(code) || sigunguByCode.has(code)

// 시·도 전체인지 (2자리)
export const isWholeSido = (code: string) => code.length === 2

// 화면 표시: '11' → '서울특별시 전체', '11110' → '서울특별시 종로구' (모르는 코드는 그대로)
export function regionLabel(code: string) {
  const sido = sidoByCode.get(code)
  if (sido) return `${sido.name} 전체`
  const sigungu = sigunguByCode.get(code)
  if (!sigungu) return code
  return `${sidoByCode.get(sigungu.sidoCode)?.name ?? ''} ${sigungu.name}`.trim()
}

// 두 지역이 겹치는지: 같은 코드이거나, 한쪽이 다른 쪽의 시·도 전체
export const regionsOverlap = (a: string, b: string) =>
  a === b || (isWholeSido(a) && b.startsWith(a)) || (isWholeSido(b) && a.startsWith(b))

// 목록 안에서 서로 겹치는 지역 쌍 (예: 서울 전체 + 서울 종로구)
export function overlapsWithin(codes: readonly string[]) {
  const pairs: [string, string][] = []
  codes.forEach((a, i) =>
    codes.slice(i + 1).forEach((b) => regionsOverlap(a, b) && pairs.push([a, b])),
  )
  return pairs
}

// 정렬: 법정동코드 순서 (시·도 → 그 시·도의 시·군·구)
export const sortRegions = (codes: readonly string[]) =>
  [...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

// 목록 요약: '서울특별시 전체, 경기도 성남시 외 3곳'
export function summarizeRegions(codes: readonly string[], max = 2) {
  const labels = sortRegions(codes).map(regionLabel)
  if (labels.length <= max) return labels.join(', ')
  return `${labels.slice(0, max).join(', ')} 외 ${labels.length - max}곳`
}
