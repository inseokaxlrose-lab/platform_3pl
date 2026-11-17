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

// 가나다순 비교 (한국어 기준)
const byName = (a: string, b: string) => a.localeCompare(b, 'ko')

// 지역 고르기 화면용 목록: 시·도 가나다순, 한 시·도의 시·군·구 가나다순
export const SIDO_BY_NAME = [...SIDO_LIST].sort((a, b) => byName(a.name, b.name))
export const sigungusByName = (sidoCode: string) =>
  SIGUNGU_LIST.filter((s) => s.sidoCode === sidoCode).sort((a, b) => byName(a.name, b.name))

// 정렬: 시·도 이름 가나다순 → 같은 시·도 안에서는 "전체" 먼저, 그다음 시·군·구 이름 가나다순 (모르는 코드는 맨 뒤)
const sidoName = (code: string) => sidoByCode.get(code.slice(0, 2))?.name ?? '\uffff'
export const sortRegions = (codes: readonly string[]) =>
  [...codes].sort(
    (a, b) =>
      byName(sidoName(a), sidoName(b)) ||
      Number(!isWholeSido(a)) - Number(!isWholeSido(b)) ||
      byName(sigunguByCode.get(a)?.name ?? a, sigunguByCode.get(b)?.name ?? b),
  )

// 목록 요약: '서울특별시 전체, 경기도 성남시 외 3곳'
export function summarizeRegions(codes: readonly string[], max = 2) {
  const labels = sortRegions(codes).map(regionLabel)
  if (labels.length <= max) return labels.join(', ')
  return `${labels.slice(0, max).join(', ')} 외 ${labels.length - max}곳`
}
