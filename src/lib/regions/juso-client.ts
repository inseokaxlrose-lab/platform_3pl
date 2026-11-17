import 'server-only'

// 주소 검색기 (docs/address-normalization.md)
// 정제 모듈은 이 약속(AddressSearcher)만 알고, 실제 검색은 바꿔 끼운다
//   - 실시간 단건: 도로명주소 검색 API (juso.go.kr, .env JUSO_CONFM_KEY)
//   - 테스트: 가짜 검색기 / 대량(2차): 로컬 주소 DB 검색기
// 키가 없거나 연결이 안 되면 'UNAVAILABLE' → 정제 모듈이 API 단계를 건너뛰고, 그 결과는 캐시하지 않는다

export type AddressHit = {
  roadAddress: string // 도로명주소 (참고항목 제외)
  jibunAddress: string
  zipCode: string // 5자리
  bjdCode: string // 법정동코드 10자리
  bdMgtSn: string // 건물관리번호
  buildingName: string
}

export type SearchResult =
  { status: 'OK'; total: number; hits: AddressHit[] } | { status: 'UNAVAILABLE'; reason: string }

export type AddressSearcher = (keyword: string) => Promise<SearchResult>

const JUSO_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do'
// 한 번에 받는 후보 수 (③ 다건 동일 우편번호 판단·후보 목록용)
const COUNT_PER_PAGE = 20
const TIMEOUT_MS = 5000

type JusoResponse = {
  results?: {
    common?: { errorCode?: string; errorMessage?: string; totalCount?: string }
    juso?: {
      roadAddrPart1?: string
      jibunAddr?: string
      zipNo?: string
      admCd?: string
      bdMgtSn?: string
      bdNm?: string
    }[]
  }
}

// API 응답 → 검색 결과 (순수 함수, 테스트용으로 내보냄)
// 오류 코드: 0 정상 / E0001 승인키 오류 → 사용 불가 / 검색어 오류(E0005~E0015 등) → 0건으로 본다
export function parseJusoResponse(body: JusoResponse): SearchResult {
  const common = body.results?.common
  const code = common?.errorCode ?? ''
  if (code === 'E0001' || code === '-999') {
    return { status: 'UNAVAILABLE', reason: `주소 API 오류 ${code}: ${common?.errorMessage ?? ''}` }
  }
  if (code !== '0') return { status: 'OK', total: 0, hits: [] }
  const hits = (body.results?.juso ?? []).map((j) => ({
    roadAddress: j.roadAddrPart1 ?? '',
    jibunAddress: j.jibunAddr ?? '',
    zipCode: j.zipNo ?? '',
    bjdCode: j.admCd ?? '',
    bdMgtSn: j.bdMgtSn ?? '',
    buildingName: j.bdNm ?? '',
  }))
  return { status: 'OK', total: Number(common?.totalCount ?? hits.length) || hits.length, hits }
}

// 도로명주소 검색 API 검색기. 키가 없으면 늘 사용 불가
export function jusoSearcher(confmKey = process.env.JUSO_CONFM_KEY ?? ''): AddressSearcher {
  return async (keyword) => {
    if (!confmKey)
      return { status: 'UNAVAILABLE', reason: '주소 API 승인키(JUSO_CONFM_KEY)가 없습니다.' }
    const params = new URLSearchParams({
      confmKey,
      keyword,
      currentPage: '1',
      countPerPage: String(COUNT_PER_PAGE),
      resultType: 'json',
    })
    try {
      const response = await fetch(JUSO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      })
      if (!response.ok) return { status: 'UNAVAILABLE', reason: `주소 API 응답 ${response.status}` }
      return parseJusoResponse((await response.json()) as JusoResponse)
    } catch (error) {
      return {
        status: 'UNAVAILABLE',
        reason: `주소 API 연결 실패: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}
