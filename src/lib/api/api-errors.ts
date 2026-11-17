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
