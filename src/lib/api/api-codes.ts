import { codeSet } from '@/config/operator-codes'

// 화주 연동 API 값 목록 (docs/decisions/0081) — 프로그램이 값에 따라 동작을 바꾸므로 상수 + DB 검사 조건
// DB 검사 조건(마이그레이션 _shipper_api)과 값 목록이 같아야 한다 — 값을 더하면 마이그레이션도 함께

// 환경: TEST 키는 검증만 하고 저장하지 않는다(dry-run), LIVE 키만 실제로 저장
export const API_ENV = codeSet({ TEST: '테스트', LIVE: '운영' })
export type ApiEnv = (typeof API_ENV.values)[number]

export const API_KEY_STATUS = codeSet({ ACTIVE: '사용 중', REVOKED: '폐기', EXPIRED: '만료' })

// 키 권한 (정의서 8번 표)
export const API_SCOPE = codeSet({
  PARTNER_READ: '거래처 조회',
  PARTNER_WRITE: '거래처 등록·수정',
  ITEM_READ: '품목 조회',
  ITEM_WRITE: '품목 등록·수정',
  ASN_READ: '입고예정 조회',
  ASN_WRITE: '입고예정 등록·수정·취소',
  ORDER_READ: '출고요청 조회',
  ORDER_WRITE: '출고요청 등록·취소',
  STOCK_READ: '재고 조회 (2차)',
})
export type ApiScope = (typeof API_SCOPE.values)[number]

// 쓰기 권한 (일시정지 화주는 LIVE 키로 쓰기 API를 부를 수 없다)
export const isWriteScope = (scope: string) => scope.endsWith('_WRITE')

// 키 발급 화면의 권한 기본 묶음: 조회 전부 + 쓰기 전부 (재고 조회는 2차라 뺀다)
export const DEFAULT_SCOPES: readonly ApiScope[] = API_SCOPE.values.filter(
  (scope) => scope !== 'STOCK_READ',
)

// 화주·환경별 사용 중인 키 최대 개수 (교체 기간에 새 키와 옛 키를 함께 쓰게)
export const MAX_ACTIVE_KEYS = 2
// 분당 호출 한도 기본값
export const DEFAULT_RATE_LIMIT = 120
// 등록 API 한 번에 받는 최대 건수 (넘으면 413)
export const MAX_ITEMS_PER_REQUEST = 500

// 로그 보관 (0081 제안): 본문은 90일 뒤 비우고, 요약 줄은 1년 뒤 지운다. 멱등 응답은 24시간
export const LOG_BODY_DAYS = 90
export const LOG_KEEP_DAYS = 365
export const IDEMPOTENCY_HOURS = 24

// API 구분 (요청 로그·호출 이력의 api_cd): 새 엔드포인트를 만들면 여기에 이름을 더한다
// 키 확인 전에 실패한 요청도 이 이름으로 남는다
export const API_CODE_LABELS: Record<string, string> = {
  ME: '내 정보 (GET /me)',
  PARTNER_UPSERT: '거래처 등록·수정 (POST /partners)',
  PARTNER_LIST: '거래처 목록 (GET /partners)',
  PARTNER_GET: '거래처 상세 (GET /partners/{partnerCd})',
  SHIP_TO_UPSERT: '납품처 등록·수정 (POST /partners/{partnerCd}/ship-tos)',
  SHIP_TO_LIST: '납품처 목록 (GET /partners/{partnerCd}/ship-tos)',
  ITEM_UPSERT: '품목 등록·수정 (POST /items)',
  ITEM_LIST: '품목 목록 (GET /items)',
  ITEM_GET: '품목 상세 (GET /items/{itemCd})',
}

// 요청 로그 결과
export const API_LOG_RESULT = codeSet({ SUCCESS: '성공', PARTIAL: '부분 성공', FAIL: '실패' })
