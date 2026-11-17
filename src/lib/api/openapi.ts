import { z } from 'zod'
import { API_SCOPE, MAX_ITEMS_PER_REQUEST } from './api-codes'
import { API_ERRORS } from './api-errors'
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
    },
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
