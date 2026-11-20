// 화주 연동 API 오류코드 카탈로그 (docs/decisions/0081, docs/api-error-codes.md)
// 화주 시스템이 오류코드로 분기하므로 코드는 한 번 정하면 바꾸지 않는다 (문구는 바꿔도 됨)
// 분류: 인증(401) · 권한(403) · 형식(400) · 참조 없음 · 상태 불가 · 중복 · 정책 위반 · 한도(413·429) · 서버(500)

type ErrorDef = { status: number; category: string; message: string }

export const API_ERRORS = {
  // ── 인증 (401): 키가 없거나 틀리거나 쓸 수 없음
  API_KEY_MISSING: { status: 401, category: '인증', message: 'X-API-Key 헤더가 없습니다.' },
  API_KEY_INVALID: { status: 401, category: '인증', message: 'API 키가 올바르지 않습니다.' },
  API_KEY_REVOKED: { status: 401, category: '인증', message: '폐기된 API 키입니다.' },
  API_KEY_EXPIRED: { status: 401, category: '인증', message: '만료된 API 키입니다.' },
  // ── 권한 (403)
  HTTPS_REQUIRED: { status: 403, category: '권한', message: 'HTTPS로만 호출할 수 있습니다.' },
  IP_NOT_ALLOWED: { status: 403, category: '권한', message: '허용되지 않은 IP입니다.' },
  API_DISABLED: { status: 403, category: '권한', message: '이 화주는 API 사용이 꺼져 있습니다.' },
  OPERATOR_DISABLED: { status: 403, category: '권한', message: '운영사 이용이 중지되었습니다.' },
  CLIENT_NOT_ACTIVE: {
    status: 403,
    category: '권한',
    message: '준비중인 화주는 TEST 키로만 호출할 수 있습니다.',
  },
  CLIENT_SUSPENDED: {
    status: 403,
    category: '권한',
    message: '일시정지된 화주는 조회 API만 호출할 수 있습니다.',
  },
  CLIENT_TERMINATED: { status: 403, category: '권한', message: '해지된 화주입니다.' },
  SCOPE_REQUIRED: { status: 403, category: '권한', message: '이 API를 호출할 권한이 없습니다.' },
  // ── 형식 (400)
  INVALID_JSON: { status: 400, category: '형식', message: '요청 본문이 JSON이 아닙니다.' },
  VALIDATION_FAILED: { status: 400, category: '형식', message: '입력값을 확인해 주세요.' },
  // ── 참조 없음 (404 또는 건별 FAIL)
  NOT_FOUND: { status: 404, category: '참조 없음', message: '찾을 수 없습니다.' },
  // ── 상태 불가 · 중복 · 정책 위반 (건별 FAIL에 주로 쓰임)
  STATUS_NOT_ALLOWED: {
    status: 409,
    category: '상태 불가',
    message: '지금 상태에서는 할 수 없습니다.',
  },
  DUPLICATE: { status: 409, category: '중복', message: '이미 있는 문서번호입니다.' },
  POLICY_VIOLATION: { status: 422, category: '정책 위반', message: '화주 정책에 맞지 않습니다.' },
  // ── 거래처·납품처 (0082 ③) — 건별 결과(items[].errors[]·shipTos[].error)로 온다
  PARTNER_CD_INVALID: {
    status: 400,
    category: '형식',
    message: 'partnerCd는 영문·숫자·하이픈·밑줄 30자 이하입니다.',
  },
  SHIP_TO_CD_INVALID: {
    status: 400,
    category: '형식',
    message: 'shipToCd가 형식에 맞지 않거나 한 요청에 두 번 있습니다.',
  },
  PARTNER_ADDRESS_REQUIRED: {
    status: 422,
    category: '정책 위반',
    message: '납품처 없이 등록하려면 거래처 주소가 필요합니다.',
  },
  DEFAULT_SHIP_TO_REQUIRED: {
    status: 422,
    category: '정책 위반',
    message: '기본 납품처는 꼭 1곳이어야 합니다.',
  },
  LAST_SHIP_TO_INACTIVE: {
    status: 422,
    category: '정책 위반',
    message: '사용 중인 납품처(기본 포함)가 1곳 이상 있어야 합니다.',
  },
  CENTER_REQUIRED: {
    status: 422,
    category: '정책 위반',
    message: '이 화주는 납품처 배송센터(centerCd)를 꼭 보내야 합니다.',
  },
  INVALID_CENTER_CD: { status: 404, category: '참조 없음', message: '없는 센터코드입니다.' },
  NOT_CLIENT_CENTER: {
    status: 422,
    category: '정책 위반',
    message: '화주가 이용하지 않는 센터입니다.',
  },
  CENTER_INACTIVE: {
    status: 409,
    category: '상태 불가',
    message: '일시중지·폐쇄된 센터입니다.',
  },
  ADDRESS_NOT_RESOLVED: {
    status: 422,
    category: '정책 위반',
    message: '주소를 확인하지 못해 배송센터를 정할 수 없습니다.',
  },
  // ── 품목 (0083 ③) — 건별 결과(items[].errors[])로 온다
  ITEM_CD_INVALID: {
    status: 400,
    category: '형식',
    message: 'itemCd는 영문·숫자·점·하이픈·밑줄 50자 이하입니다.',
  },
  BASE_UOM_INVALID: {
    status: 422,
    category: '정책 위반',
    message: '기본단위가 올바르지 않습니다 (포장 단위·사용 중지 단위는 안 됨).',
  },
  UOM_NOT_FOUND: { status: 404, category: '참조 없음', message: '없는 단위 코드입니다.' },
  UOM_QTY_INVALID: {
    status: 422,
    category: '정책 위반',
    message: '환산수량이 올바르지 않습니다 (레벨 순서·소수 자리).',
  },
  PALLET_TYPE_NOT_FOUND: { status: 404, category: '참조 없음', message: '없는 팔레트 종류입니다.' },
  BARCODE_DUPLICATE: {
    status: 409,
    category: '중복',
    message: '이 화주사의 다른 품목이 쓰는 바코드입니다.',
  },
  BARCODE_CHECKDIGIT: {
    status: 400,
    category: '형식',
    message: '바코드 자리수·체크디지트가 맞지 않습니다.',
  },
  EXPIRY_INFO_REQUIRED: {
    status: 422,
    category: '정책 위반',
    message: '기한 관리 품목은 expiryType·expiryInput이 필요합니다.',
  },
  SHELF_LIFE_REQUIRED: {
    status: 422,
    category: '정책 위반',
    message: '제조일 입력 방식은 shelfLifeDays가 필요합니다.',
  },
  LOT_SOURCE_REQUIRED: {
    status: 422,
    category: '정책 위반',
    message: 'LOT 관리 품목은 lotSource가 필요합니다.',
  },
  ITEM_STOCK_EXISTS: {
    status: 409,
    category: '상태 불가',
    message: '재고가 있어 기본단위·기한/LOT/시리얼 관리 여부를 바꿀 수 없습니다.',
  },
  ITEM_OPEN_DOC_EXISTS: {
    status: 409,
    category: '상태 불가',
    message: '미완료 입고예정이 있어 바꿀 수 없습니다.',
  },
  REGION_UNASSIGNED: {
    status: 422,
    category: '정책 위반',
    message: '권역설정에 배정되지 않은 지역이라 배송센터를 정할 수 없습니다.',
  },
  REGION_MIXED: {
    status: 422,
    category: '정책 위반',
    message: '여러 센터가 섞인 지역이라 배송센터를 정할 수 없습니다. centerCd를 보내 주세요.',
  },
  // ── 멱등 · 한도
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    category: '중복',
    message: '같은 Idempotency-Key로 다른 내용을 보냈습니다.',
  },
  TOO_MANY_ITEMS: {
    status: 413,
    category: '한도',
    message: '한 번에 보낼 수 있는 건수를 넘었습니다.',
  },
  RATE_LIMITED: { status: 429, category: '한도', message: '분당 호출 한도를 넘었습니다.' },
  // ── 서버
  INTERNAL_ERROR: {
    status: 500,
    category: '서버',
    message: '서버 오류입니다. 요청ID로 문의해 주세요.',
  },
} as const satisfies Record<string, ErrorDef>

export type ApiErrorCode = keyof typeof API_ERRORS

export type ApiKnownKey = {
  operatorId: bigint
  shipperId: bigint
  apiClientId: bigint
  env: string
}

// API 처리 중 던지는 오류 → 공통 응답 봉투의 error로 바뀐다
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly field?: string
  readonly headers?: Record<string, string>
  // 키는 확인됐지만 거부한 경우(폐기·만료·IP·상태): 로그에 어느 화주·키였는지 남긴다 (유출 의심 추적)
  readonly known?: ApiKnownKey

  constructor(
    code: ApiErrorCode,
    options: {
      message?: string
      field?: string
      headers?: Record<string, string>
      known?: ApiKnownKey
    } = {},
  ) {
    super(options.message ?? API_ERRORS[code].message)
    this.code = code
    this.status = API_ERRORS[code].status
    this.field = options.field
    this.headers = options.headers
    this.known = options.known
  }
}
