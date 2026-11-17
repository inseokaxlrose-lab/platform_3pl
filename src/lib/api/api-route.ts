import 'server-only'
import { randomBytes } from 'node:crypto'
import { after } from 'next/server'
import { ZodError } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { runInContext } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { MAX_ITEMS_PER_REQUEST, type ApiScope } from './api-codes'
import { API_ERRORS, ApiError, type ApiErrorCode } from './api-errors'
import { authenticate, type ApiContext } from './authenticate'
import { findIdempotentResponse, saveIdempotentResponse } from './idempotency'
import { consumeRateLimit, rateLimitHeaders } from './rate-limit'
import { saveRequestLog, type ApiItemResult } from './request-log'

// 화주 연동 API 공통 틀 (docs/decisions/0081) — /api/v1/* 라우트는 모두 이 함수로 만든다
// 순서: 요청ID → HTTPS → (쓰기) 본문 읽기 → 키 인증 → 호출 한도 → (쓰기) 멱등 확인 → 처리 → 공통 응답 봉투 → 로그(응답 뒤)
// 처리는 운영사 출입증(runInContext) 안에서 돈다 → prisma.ts가 이 운영사로 자동으로 거른다. 데이터 범위는 ctx.api.scope(이 화주만)

// 처리 함수가 돌려주는 값
// - data: 한 건 응답 (GET /me 등) → { requestId, result: 'SUCCESS', data }
// - items: 여러 건 등록 결과 → { requestId, result: SUCCESS|PARTIAL|FAIL, summary, items }
export type ApiHandlerResult =
  | { data: unknown; items?: undefined }
  | {
      // extra: 건별 결과에 덧붙일 값 (예: 거래처의 납품처별 결과 shipTos)
      items: (ApiItemResult & {
        id?: string | null
        errors?: ApiFieldError[]
        extra?: Record<string, unknown>
      })[]
      data?: undefined
    }

export type ApiFieldError = { code: string; field?: string; message: string }

export type ApiHandlerContext = {
  api: ApiContext
  requestId: string
  request: Request
  // 쓰기 API의 본문 (JSON으로 읽은 값)
  body: unknown
  // TEST 키 = 검증만 하고 저장하지 않는다 (writeTransaction이 되돌린다)
  dryRun: boolean
  // 주소의 경로 값 (예: /partners/{partnerCd} → { partnerCd })
  params: Record<string, string>
}

type ApiRouteOptions = {
  // 로그·호출 이력의 API 구분 (예: ME, PARTNER_UPSERT)
  apiCode: string
  // 필요한 권한 (없으면 키만 맞으면 됨)
  scope?: ApiScope
  // 쓰기 API: 본문을 읽고 Idempotency-Key를 처리한다
  write?: boolean
  handler: (ctx: ApiHandlerContext) => Promise<ApiHandlerResult>
}

// 요청ID: req_YYYYMMDD(한국 날짜)_무작위16자 (응답에 넣어 화주가 문의할 때 쓴다)
export function newRequestId(now = new Date()) {
  const day = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(/-/g, '')
  return `req_${day}_${randomBytes(8).toString('hex')}`
}

// 호출 IP: 프록시 뒤면 X-Forwarded-For의 첫 번째
export function clientIpOf(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || null
}

// 운영에서는 HTTPS만 (프록시가 알려 주는 원래 프로토콜로 판단). 개발·테스트는 http 허용
function assertHttps(request: Request) {
  if (process.env.NODE_ENV !== 'production') return
  const proto =
    request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
  if (proto !== 'https') throw new ApiError('HTTPS_REQUIRED')
}

// 응답 뒤에 할 일 (로그 저장 등). 요청 밖(테스트)에서는 바로 실행하고, 테스트가 기다릴 수 있게 모아 둔다
const pending = new Set<Promise<unknown>>()
function runAfter(task: () => Promise<unknown>) {
  const run = () => {
    const promise = task().catch((error) => console.error('[api] 응답 뒤 작업 실패', error))
    pending.add(promise)
    void promise.finally(() => pending.delete(promise))
    return promise
  }
  try {
    after(run)
  } catch {
    void run()
  }
}
// 테스트용: 응답 뒤 작업(로그 저장)이 끝날 때까지 기다린다
export async function flushApiTasks() {
  while (pending.size > 0) await Promise.all([...pending])
}

// 서비스 오류(ActionError)·입력 규칙 오류(Zod) → API 오류코드
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof ZodError) {
    const issue = error.issues[0]
    return new ApiError('VALIDATION_FAILED', {
      message: issue?.message,
      field: issue?.path.join('.') || undefined,
    })
  }
  if (error instanceof ActionError) {
    const map: Record<string, ApiErrorCode> = {
      VALIDATION: 'VALIDATION_FAILED',
      NOT_FOUND: 'NOT_FOUND',
      CONFLICT: 'STATUS_NOT_ALLOWED',
      FORBIDDEN: 'SCOPE_REQUIRED',
    }
    return new ApiError(map[error.code] ?? 'INTERNAL_ERROR', { message: error.message })
  }
  console.error('[api] 처리 중 오류', error)
  return new ApiError('INTERNAL_ERROR')
}

const json = (body: unknown) =>
  JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? String(value) : value))

// 공통 응답 봉투 만들기
function envelope(requestId: string, result: ApiHandlerResult, dryRun: boolean) {
  const base = { requestId, ...(dryRun && { dryRun: true }) }
  if (result.items === undefined) return { ...base, result: 'SUCCESS' as const, data: result.data }
  const fail = result.items.filter((item) => item.result === 'FAIL').length
  const total = result.items.length
  return {
    ...base,
    result:
      fail === 0 ? ('SUCCESS' as const) : fail === total ? ('FAIL' as const) : ('PARTIAL' as const),
    summary: { total, success: total - fail, fail },
    items: result.items.map(
      ({ seq, docNo, result: itemResult, id, errors, internalId, extra }) => ({
        seq,
        docNo: docNo ?? null,
        result: itemResult,
        ...(itemResult === 'FAIL'
          ? { errors: errors ?? [] }
          : {
              id:
                id ?? (internalId !== undefined && internalId !== null ? String(internalId) : null),
            }),
        ...extra,
      }),
    ),
  }
}

// 등록 API의 배열 본문 꺼내기: 배열이 아니면 400, 최대 건수를 넘으면 413
export function readItems(body: unknown, key = 'items'): unknown[] {
  const list = Array.isArray(body) ? body : (body as Record<string, unknown> | null)?.[key]
  if (!Array.isArray(list)) {
    throw new ApiError('VALIDATION_FAILED', {
      message: `본문은 배열 또는 { ${key}: [...] }입니다.`,
    })
  }
  if (list.length > MAX_ITEMS_PER_REQUEST) {
    throw new ApiError('TOO_MANY_ITEMS', {
      message: `한 번에 ${MAX_ITEMS_PER_REQUEST}건까지 보낼 수 있습니다. (보낸 건수 ${list.length})`,
    })
  }
  return list
}

// 쓰기 처리용 트랜잭션: LIVE는 그대로 저장, TEST는 끝까지 처리한 뒤 되돌린다 (dry-run — 자동 지정될 배송센터 등 결과는 그대로 계산)
// 리소스 API는 저장 함수에 이 tx를 넘긴다 (저장 함수가 따로 트랜잭션을 열지 않게)
class DryRunRollback<T> extends Error {
  constructor(readonly value: T) {
    super('dry-run rollback')
  }
}
export async function writeTransaction<T>(ctx: ApiHandlerContext, fn: (tx: Db) => Promise<T>) {
  if (!ctx.dryRun) return prisma.$transaction((tx) => fn(tx))
  try {
    await prisma.$transaction(async (tx) => {
      throw new DryRunRollback(await fn(tx))
    })
  } catch (error) {
    if (error instanceof DryRunRollback) return error.value as T
    throw error
  }
  throw new Error('dry-run이 되돌려지지 않았습니다.')
}

// 라우트 핸들러 만들기: export const GET = apiRoute({ apiCode: 'ME', handler: … })
// 경로 값이 있는 라우트(/partners/[partnerCd])는 Next가 두 번째 인자로 params를 준다
type RouteContext = { params?: Promise<Record<string, string | string[]>> }

export function apiRoute(options: ApiRouteOptions) {
  return async (request: Request, route?: RouteContext): Promise<Response> => {
    const requestId = newRequestId()
    const startedAt = new Date()
    const clientIp = clientIpOf(request)
    const idempotencyKey = options.write
      ? request.headers.get('idempotency-key')?.trim().slice(0, 100) || null
      : null
    let api: ApiContext | undefined
    let bodyText: string | null = null
    let status = 200
    let responseText = ''
    let extraHeaders: Record<string, string> = {}
    let items: ApiItemResult[] = []
    let errorCode: string | null = null
    let logResult: 'SUCCESS' | 'PARTIAL' | 'FAIL' = 'SUCCESS'
    let replayed = false
    // 인증까지 통과했는지 (최근 사용은 통과한 호출만)
    let authenticated = false

    try {
      assertHttps(request)
      if (options.write) bodyText = await request.text()
      api = await authenticate(request.headers.get('x-api-key'), clientIp, { scope: options.scope })
      authenticated = true
      const limit = await consumeRateLimit(api.apiClientId, api.rateLimitPerMin)
      extraHeaders = rateLimitHeaders(limit)
      if (!limit.allowed) {
        throw new ApiError('RATE_LIMITED', {
          message: `분당 ${limit.limit}회까지 호출할 수 있습니다. ${limit.retryAfter}초 뒤 다시 시도하세요.`,
        })
      }
      // 같은 Idempotency-Key로 다시 보낸 요청: 처음 응답을 그대로
      if (idempotencyKey && bodyText !== null) {
        const stored = await findIdempotentResponse(api.apiClientId, idempotencyKey, bodyText)
        if (stored) {
          replayed = true
          status = stored.status
          responseText = stored.body
          extraHeaders['Idempotent-Replayed'] = 'true'
        }
      }
      if (!replayed) {
        let body: unknown = undefined
        if (bodyText !== null) {
          try {
            body = bodyText ? JSON.parse(bodyText) : null
          } catch {
            throw new ApiError('INVALID_JSON')
          }
        }
        const rawParams = (await route?.params) ?? {}
        const ctx: ApiHandlerContext = {
          api,
          requestId,
          request,
          body,
          dryRun: api.env === 'TEST',
          params: Object.fromEntries(Object.entries(rawParams).map(([k, v]) => [k, String(v)])),
        }
        const result = await runInContext(
          { actor: `api:${api.keyPrefix}`, operatorId: api.operatorId },
          () => options.handler(ctx),
        )
        const wrapped = envelope(requestId, result, ctx.dryRun)
        logResult = wrapped.result
        items = (result.items ?? []).map(
          ({ seq, docNo, result: r, errorCode: code, errorMsg, internalId, errors }) => ({
            seq,
            docNo,
            result: r,
            errorCode: code ?? errors?.[0]?.code ?? null,
            errorMsg: errorMsg ?? errors?.[0]?.message ?? null,
            internalId,
          }),
        )
        if (logResult === 'FAIL') errorCode = items.find((i) => i.errorCode)?.errorCode ?? null
        responseText = json(wrapped)
        if (idempotencyKey && bodyText !== null) {
          await saveIdempotentResponse(api.apiClientId, idempotencyKey, bodyText, {
            status,
            body: responseText,
            requestId,
          })
        }
      }
    } catch (caught) {
      const error = toApiError(caught)
      // 키는 확인됐지만 거부한 경우: 로그에 화주·키를 남긴다
      if (!api && error.known) {
        api = {
          ...error.known,
          env: error.known.env as ApiContext['env'],
        } as ApiContext
      }
      status = error.status
      errorCode = error.code
      logResult = 'FAIL'
      extraHeaders = { ...extraHeaders, ...error.headers }
      responseText = json({
        requestId,
        result: 'FAIL',
        error: {
          code: error.code,
          message: error.message,
          ...(error.field && { field: error.field }),
          category: API_ERRORS[error.code].category,
        },
      })
    }

    // 응답 뒤: 요청 로그 + 키 최근 사용 (응답 속도에 영향 없게)
    const finishedApi = api
    const durationMs = Date.now() - startedAt.getTime()
    runAfter(async () => {
      await saveRequestLog({
        requestId,
        operatorId: finishedApi?.operatorId,
        shipperId: finishedApi?.shipperId,
        apiClientId: finishedApi?.apiClientId,
        env: finishedApi?.env,
        apiCode: options.apiCode,
        httpMethod: request.method,
        path: new URL(request.url).pathname.slice(0, 300),
        clientIp,
        idempotencyKey,
        requestedAt: startedAt,
        durationMs,
        httpStatus: status,
        result: logResult,
        errorCode,
        requestBody: bodyText,
        responseBody: replayed ? null : responseText,
        items,
      })
      // 최근 사용은 사람이 고친 것이 아니라 버전·수정자를 바꾸지 않는다 (키 수정 팝업이 충돌하지 않게) → SQL로 직접
      if (finishedApi && authenticated) {
        await prisma.$executeRaw`
          UPDATE tb_api_client SET last_used_at = ${startedAt}, last_used_ip = ${clientIp}
          WHERE api_client_id = ${finishedApi.apiClientId}`
      }
    })

    return new Response(responseText, {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Request-Id': requestId,
        'Cache-Control': 'no-store',
        ...extraHeaders,
      },
    })
  }
}
