import { z } from 'zod'
import { API_SCOPE, MAX_ITEMS_PER_REQUEST } from './api-codes'
import { API_ERRORS } from './api-errors'
import { partnerSchema, partnerShipToSchema } from '@/lib/customers/customer-upsert'
import { meResponseSchema } from './endpoints/me'

// 화주 연동 API OpenAPI 명세 (docs/decisions/0081) — /api/v1/openapi.json
// 화주 연동 API만 따로 (화면용 서버 액션·내부 API와 섞지 않는다). 응답 모양은 Zod 규칙에서 만든다 (손으로 쓰지 않음)
// 새 엔드포인트를 만들면 paths에 한 줄 더한다 (요청·응답 Zod 규칙 → toJSONSchema)

const schema = (zodSchema: z.ZodType) =>
  z.toJSONSchema(zodSchema, { target: 'openapi-3.0', unrepresentable: 'any' })

const errorCodes = Object.keys(API_ERRORS)

export function buildOpenApi(serverUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: '3PL 화주 연동 API',
      version: 'v1',
      description: [
        '화주 시스템(ERP·쇼핑몰)이 거래처·품목·입고예정(ASN)·출고요청을 연동하는 API입니다.',
        '',
        '- 인증: `X-API-Key` 헤더 (HTTPS 전용). 키 하나가 화주를 정하므로 URL·본문에 화주코드를 넣지 않습니다.',
        '- 환경: `test_` 키는 검증만 하고 저장하지 않습니다(dry-run, 응답에 `dryRun: true`). `live_` 키만 실제로 저장합니다.',
        `- 등록 API는 배열로 받고 한 번에 ${MAX_ITEMS_PER_REQUEST}건까지, 건별 결과를 돌려줍니다 (100건 중 3건 오류면 97건 처리).`,
        '- 같은 요청을 다시 보내도 두 번 처리되지 않게 `Idempotency-Key` 헤더를 쓰세요 (24시간).',
        '- 모르는 응답 필드는 무시하세요. 필드 추가는 같은 버전(v1)에서 합니다.',
        '- 응답의 `requestId`(헤더 `X-Request-Id`)로 문의하세요.',
      ].join('\n'),
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    security: [{ ApiKey: [] }],
    components: {
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['requestId', 'result', 'error'],
          properties: {
            requestId: { type: 'string', example: 'req_20261117_8f3a1c2b4d5e6f70' },
            result: { type: 'string', enum: ['FAIL'] },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', enum: errorCodes },
                message: { type: 'string' },
                field: { type: 'string', description: '문제가 된 입력 칸 (있으면)' },
                category: {
                  type: 'string',
                  description: '인증·권한·형식·참조 없음·상태 불가·중복·정책 위반·한도·서버',
                },
              },
            },
          },
        },
        Scope: { type: 'string', enum: API_SCOPE.values },
      },
      responses: {
        Unauthorized: errorResponse('키가 없거나 틀림·폐기·만료 (API_KEY_*)'),
        Forbidden: errorResponse('권한·IP·화주 상태 (SCOPE_REQUIRED, IP_NOT_ALLOWED, CLIENT_* …)'),
        TooManyRequests: errorResponse('분당 호출 한도 초과 (RATE_LIMITED, Retry-After 헤더)'),
      },
    },
    paths: {
      '/me': {
        get: {
          summary: '내 정보 (연동 테스트)',
          description:
            '이 키의 화주·환경·권한·이용 센터를 돌려줍니다. 키를 받으면 가장 먼저 호출해 연결을 확인하세요.',
          operationId: 'getMe',
          tags: ['공통'],
          responses: {
            '200': {
              description: '성공',
              headers: rateLimitHeaders(),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['requestId', 'result', 'data'],
                    properties: {
                      requestId: { type: 'string' },
                      result: { type: 'string', enum: ['SUCCESS'] },
                      dryRun: { type: 'boolean', description: 'TEST 키일 때만 true' },
                      data: schema(meResponseSchema),
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '429': { $ref: '#/components/responses/TooManyRequests' },
          },
        },
      },
      // ── 거래처·납품처 (0082 ③, 필드 대응: docs/api-partner-fields.md)
      '/partners': {
        post: {
          summary: '거래처 등록·수정 (upsert)',
          description: [
            '업무 키는 `partnerCd`(화주 안에서 고유, 바꿀 수 없음). 없으면 만들고, 있으면 **보낸 칸만** 고칩니다 (안 보낸 칸은 그대로, `null`은 값 지우기).',
            '`shipTos`는 **보낸 납품처만** 추가·수정합니다 (빠진 납품처는 그대로, 사용 중지는 `status: INACTIVE`). 새 거래처에 `shipTos`가 없으면 거래처 주소로 기본 납품처를 만듭니다.',
            '`centerCd`가 있으면 그 센터, `null`이면 권역 자동, 안 보내면 지금 지정 그대로. 화주 정책으로 반려된 납품처만 `shipTos[].result = FAIL`.',
            '내용이 같으면 `UNCHANGED`(수정일 그대로).',
          ].join('\n\n'),
          operationId: 'upsertPartners',
          tags: ['거래처'],
          parameters: [idempotencyHeader()],
          requestBody: arrayBody(schema(partnerSchema)),
          responses: itemsResponses({ shipTos: { type: 'array', items: SHIP_TO_RESULT } }),
        },
        get: {
          summary: '거래처 목록',
          description:
            '수정일시가 `updatedAfter`보다 뒤인 거래처를 키 순서로. 다음 쪽은 응답의 `nextCursor`를 `cursor`로 보내세요.',
          operationId: 'listPartners',
          tags: ['거래처'],
          parameters: [
            { name: 'updatedAfter', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
            },
          ],
          responses: dataResponses({
            type: 'object',
            properties: {
              items: { type: 'array', items: PARTNER },
              nextCursor: { type: 'string', nullable: true },
            },
          }),
        },
      },
      '/partners/{partnerCd}': {
        get: {
          summary: '거래처 상세 (납품처 포함)',
          operationId: 'getPartner',
          tags: ['거래처'],
          parameters: [partnerCdParam()],
          responses: dataResponses({
            allOf: [
              PARTNER,
              { type: 'object', properties: { shipTos: { type: 'array', items: SHIP_TO } } },
            ],
          }),
        },
      },
      '/partners/{partnerCd}/ship-tos': {
        post: {
          summary: '납품처 등록·수정 (upsert)',
          description:
            '건 하나 = 납품처 하나. 규칙은 `POST /partners`의 shipTos와 같습니다. 거래처가 없으면 404.',
          operationId: 'upsertShipTos',
          tags: ['거래처'],
          parameters: [partnerCdParam(), idempotencyHeader()],
          requestBody: arrayBody(schema(partnerShipToSchema)),
          responses: itemsResponses(SHIP_TO_RESULT.properties),
        },
        get: {
          summary: '납품처 목록',
          operationId: 'listShipTos',
          tags: ['거래처'],
          parameters: [partnerCdParam()],
          responses: dataResponses({
            type: 'object',
            properties: { items: { type: 'array', items: SHIP_TO } },
          }),
        },
      },
    },
  }
}

// ── 거래처 응답 모양 (조회)
const nullableText = { type: 'string', nullable: true }
const PARTNER = {
  type: 'object',
  properties: {
    partnerCd: { type: 'string' },
    partnerNm: { type: 'string' },
    shortNm: nullableText,
    partnerType: { ...nullableText, description: '공통코드 PARTNER_TYPE' },
    partnerGroup: nullableText,
    bizRegNo: { ...nullableText, description: '숫자만' },
    ceoNm: nullableText,
    orderAddrMode: { type: 'string', enum: ['SHIP_TO', 'ORDER_ADDR'] },
    telNo: { ...nullableText, description: '숫자만' },
    faxNo: nullableText,
    email: nullableText,
    zipCd: nullableText,
    addr1: nullableText,
    addr2: nullableText,
    addrGrade: { ...nullableText, description: '주소 정제 등급 A~F' },
    minShelfDays: { type: 'integer', nullable: true },
    minShelfRatio: { type: 'number', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] },
    source: { type: 'string', enum: ['SCREEN', 'PORTAL', 'API', 'UPLOAD', 'ORDER_AUTO'] },
    remark: nullableText,
    lastIfAt: { type: 'string', format: 'date-time', nullable: true },
    updatedAt: { type: 'string', format: 'date-time' },
    shipToCount: { type: 'integer', description: '목록에서만' },
  },
}
const CENTER_FIELDS = {
  addrGrade: { type: 'string', description: '주소 정제 등급 A~F' },
  centerCd: { ...nullableText, description: '배송센터코드 (확인 필요면 null)' },
  centerAssignType: { type: 'string', nullable: true, enum: ['IF', 'AUTO', 'MANUAL', null] },
  centerAssignStatus: { type: 'string', enum: ['ASSIGNED', 'NEED_CONFIRM'] },
  confirmReason: {
    ...nullableText,
    description:
      'NEED_CONFIRM 사유: ADDR_NOT_RESOLVED·REGION_UNASSIGNED·REGION_MIXED·NOT_CLIENT_CENTER·CENTER_INACTIVE·INVALID_CENTER_CD',
  },
  regionMismatch: { type: 'boolean', description: '권역 기준 센터와 다른 센터로 지정됨' },
}
const SHIP_TO = {
  type: 'object',
  properties: {
    shipToCd: { type: 'string' },
    shipToNm: { type: 'string' },
    default: { type: 'boolean' },
    addrSync: { type: 'boolean' },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    zipCd: nullableText,
    addr1: { type: 'string' },
    addr2: nullableText,
    refinedZipCd: nullableText,
    refinedAddr: { type: 'string' },
    receiverNm: nullableText,
    receiverTelNo: nullableText,
    receiverTelNo2: nullableText,
    deliveryMemo: nullableText,
    ...CENTER_FIELDS,
    remark: nullableText,
    updatedAt: { type: 'string', format: 'date-time' },
  },
}
// 등록 결과의 납품처 한 곳
const SHIP_TO_RESULT = {
  type: 'object',
  properties: {
    shipToCd: { type: 'string' },
    result: { type: 'string', enum: ['CREATED', 'UPDATED', 'UNCHANGED', 'FAIL'] },
    zipCd: { ...nullableText, description: '정제한 우편번호' },
    ...CENTER_FIELDS,
    errors: { type: 'array', items: FIELD_ERROR(), description: 'FAIL일 때' },
  },
}

function FIELD_ERROR() {
  return {
    type: 'object',
    properties: {
      code: { type: 'string', enum: errorCodes },
      field: { type: 'string' },
      message: { type: 'string' },
    },
  }
}

function partnerCdParam() {
  return { name: 'partnerCd', in: 'path', required: true, schema: { type: 'string' } }
}

function idempotencyHeader() {
  return {
    name: 'Idempotency-Key',
    in: 'header',
    required: false,
    schema: { type: 'string', maxLength: 100 },
    description: '같은 키로 다시 보내면 처음 응답을 그대로 돌려줍니다 (24시간)',
  }
}

function arrayBody(item: unknown) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'array', maxItems: MAX_ITEMS_PER_REQUEST, items: item },
      },
    },
  }
}

function common4xx() {
  return {
    '401': { $ref: '#/components/responses/Unauthorized' },
    '403': { $ref: '#/components/responses/Forbidden' },
    '429': { $ref: '#/components/responses/TooManyRequests' },
  }
}

function dataResponses(data: unknown) {
  return {
    '200': {
      description: '성공',
      headers: rateLimitHeaders(),
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              requestId: { type: 'string' },
              result: { type: 'string', enum: ['SUCCESS'] },
              data,
            },
          },
        },
      },
    },
    '404': errorResponse('거래처 없음 (NOT_FOUND)'),
    ...common4xx(),
  }
}

// 등록 API 응답: 건별 결과 (전체 성공 SUCCESS · 일부 PARTIAL · 전체 실패 FAIL 모두 200)
function itemsResponses(extra: Record<string, unknown>) {
  return {
    '200': {
      description: '처리함 (건별 결과는 items)',
      headers: rateLimitHeaders(),
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              requestId: { type: 'string' },
              result: { type: 'string', enum: ['SUCCESS', 'PARTIAL', 'FAIL'] },
              dryRun: { type: 'boolean', description: 'TEST 키일 때만 true (저장 안 함)' },
              summary: {
                type: 'object',
                properties: {
                  total: { type: 'integer' },
                  success: { type: 'integer' },
                  fail: { type: 'integer' },
                },
              },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    seq: { type: 'integer', description: '보낸 순서 (1부터)' },
                    docNo: { type: 'string', nullable: true },
                    result: { type: 'string', enum: ['CREATED', 'UPDATED', 'UNCHANGED', 'FAIL'] },
                    id: { type: 'string', nullable: true },
                    errors: { type: 'array', items: FIELD_ERROR() },
                    ...extra,
                  },
                },
              },
            },
          },
        },
      },
    },
    '400': errorResponse('본문 형식 오류 (INVALID_JSON, VALIDATION_FAILED)'),
    '413': errorResponse('건수 초과 (TOO_MANY_ITEMS)'),
    ...common4xx(),
  }
}

function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  }
}

function rateLimitHeaders() {
  return {
    'X-Request-Id': { schema: { type: 'string' }, description: '요청ID (문의할 때 사용)' },
    'X-RateLimit-Limit': { schema: { type: 'integer' }, description: '분당 호출 한도' },
    'X-RateLimit-Remaining': {
      schema: { type: 'integer' },
      description: '이번 1분 동안 남은 호출 수',
    },
  }
}
