// 국가 공휴일 API (docs/decisions/0096): 공공데이터포털 「한국천문연구원_특일 정보」 공휴일 정보 조회
//   키: .env DATA_GO_KR_SERVICE_KEY (포털의 '일반 인증키' — Decoding 값 권장, Encoding 값도 받는다)
// 키가 없거나 연결·인증이 안 되면 'UNAVAILABLE' → 가져오기는 기존 자료를 그대로 둔다
// 주소 검색기(juso-client.ts)처럼 약속(HolidayFetcher)만 정하고, 시험은 가짜 함수를 끼운다

export type NationalHoliday = { date: string; name: string } // date 'YYYY-MM-DD'

export type HolidayFetchResult =
  { status: 'OK'; holidays: NationalHoliday[] } | { status: 'UNAVAILABLE'; reason: string }

export type HolidayFetcher = (year: number) => Promise<HolidayFetchResult>

const API_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'
const TIMEOUT_MS = 8000

type ApiItem = { locdate?: number | string; dateName?: string; isHoliday?: string }
type ApiResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string }
    // 0건이면 items가 빈 글자, 1건이면 item이 배열이 아니라 한 개
    body?: { items?: { item?: ApiItem | ApiItem[] } | '' }
  }
}

// API 응답 글자 → 공휴일 목록 (순수 함수, 시험용으로 내보냄)
// 인증 오류는 JSON을 달라고 해도 XML(OpenAPI_ServiceResponse)로 오므로 글자로 받아 판단한다
export function parseHolidayResponse(text: string, year: number): HolidayFetchResult {
  let body: ApiResponse
  try {
    body = JSON.parse(text) as ApiResponse
  } catch {
    const reason = /<returnAuthMsg>([^<]*)</.exec(text)?.[1] ?? /<errMsg>([^<]*)</.exec(text)?.[1]
    return {
      status: 'UNAVAILABLE',
      reason: `공휴일 API 오류: ${reason ?? '응답을 읽을 수 없습니다'}`,
    }
  }
  const header = body.response?.header
  if (header?.resultCode !== '00') {
    return {
      status: 'UNAVAILABLE',
      reason: `공휴일 API 오류 ${header?.resultCode ?? ''}: ${header?.resultMsg ?? '응답 형식이 다릅니다'}`,
    }
  }
  const items = body.response?.body?.items
  const raw = items && typeof items === 'object' ? (items.item ?? []) : []
  const list = Array.isArray(raw) ? raw : [raw]
  const holidays = list
    .filter((item) => item.isHoliday === 'Y')
    .map((item) => {
      const digits = String(item.locdate ?? '')
      return {
        date: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
        name: (item.dateName ?? '').trim(),
      }
    })
    // 다른 연도·이상한 날짜는 버린다
    .filter(
      (h) => h.name !== '' && h.date.startsWith(`${year}-`) && /^\d{4}-\d{2}-\d{2}$/.test(h.date),
    )
  return { status: 'OK', holidays }
}

// 포털 키는 Encoding(%2B…)·Decoding 두 가지로 주므로, 인코딩된 값이면 풀어서 한 번만 인코딩되게 한다
function decodeKey(key: string) {
  try {
    return key.includes('%') ? decodeURIComponent(key) : key
  } catch {
    return key
  }
}

// 실제 API 호출 (서버 전용: 키를 쓰므로 화면 코드에서 부르지 않는다)
export const fetchNationalHolidays: HolidayFetcher = async (year) => {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim()
  if (!key) {
    return {
      status: 'UNAVAILABLE',
      reason: '공휴일 API 키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않았습니다.',
    }
  }
  const params = new URLSearchParams({
    serviceKey: decodeKey(key),
    solYear: String(year),
    numOfRows: '100',
    _type: 'json',
  })
  try {
    const response = await fetch(`${API_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    const text = await response.text()
    if (!response.ok && !text.trim()) {
      return { status: 'UNAVAILABLE', reason: `공휴일 API 응답 오류 (HTTP ${response.status})` }
    }
    return parseHolidayResponse(text, year)
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      reason: `공휴일 API에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// 키를 넣었는지 (화면 안내·자동 가져오기 판단. 키 값은 화면에 보내지 않는다)
export function holidayApiConfigured() {
  return Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim())
}
