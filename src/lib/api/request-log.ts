import 'server-only'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { IDEMPOTENCY_HOURS, LOG_BODY_DAYS, LOG_KEEP_DAYS } from './api-codes'
import { maskBody } from './mask'

// API 요청 로그 저장 (docs/decisions/0081) — 응답을 보낸 뒤(after) 저장해 응답 속도에 영향이 없게
// 본문은 개인정보를 가린 뒤 저장한다. 키 원문은 어떤 로그에도 남기지 않는다 (헤더는 저장하지 않음)

export type ApiItemResult = {
  seq: number
  docNo?: string | null
  result: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'DUPLICATE' | 'FAIL'
  errorCode?: string | null
  errorMsg?: string | null
  internalId?: bigint | null
}

export type ApiLogEntry = {
  requestId: string
  operatorId?: bigint
  shipperId?: bigint
  apiClientId?: bigint
  env?: string
  apiCode: string
  httpMethod: string
  path: string
  clientIp: string | null
  idempotencyKey: string | null
  requestedAt: Date
  durationMs: number
  httpStatus: number
  result: 'SUCCESS' | 'PARTIAL' | 'FAIL'
  errorCode: string | null
  requestBody: string | null
  responseBody: string | null
  items: ApiItemResult[]
}

export async function saveRequestLog(entry: ApiLogEntry) {
  const { items, requestBody, responseBody, ...log } = entry
  const fail = items.filter((i) => i.result === 'FAIL').length
  // 운영사 출입증: 키 확인 전 실패(운영사 모름)는 출입증 없이
  await runInContext({ actor: 'api', operatorId: entry.operatorId }, async () => {
    await prisma.apiRequestLog.create({
      data: {
        ...log,
        totalCount: items.length,
        successCount: items.length - fail,
        failCount: fail,
        requestBody: maskBody(requestBody),
        responseBody: maskBody(responseBody),
        items: {
          create: items.map((item) => ({
            seq: item.seq,
            extDocNo: item.docNo?.slice(0, 50) ?? null,
            result: item.result,
            errorCode: item.errorCode ?? null,
            errorMsg: item.errorMsg?.slice(0, 500) ?? null,
            internalId: item.internalId ?? null,
          })),
        },
      },
    })
  })
  await cleanupIfDue()
}

// 오래된 로그 정리: 서버 하나에서 1시간에 한 번만 (따로 예약 작업 없이)
// 본문 90일 뒤 비움 · 요약 1년 뒤 지움 · 멱등 응답 24시간 · 지난 호출 한도 구간
let lastCleanup = 0
async function cleanupIfDue(now = Date.now()) {
  if (now - lastCleanup < 3600_000) return
  lastCleanup = now
  const day = 86_400_000
  await prisma.apiRequestLog.updateMany({
    where: {
      requestedAt: { lt: new Date(now - LOG_BODY_DAYS * day) },
      OR: [{ requestBody: { not: null } }, { responseBody: { not: null } }],
    },
    data: { requestBody: null, responseBody: null },
  })
  await prisma.apiRequestLog.deleteMany({
    where: { requestedAt: { lt: new Date(now - LOG_KEEP_DAYS * day) } },
  })
  await prisma.apiIdempotency.deleteMany({
    where: { createdAt: { lt: new Date(now - IDEMPOTENCY_HOURS * 3600_000) } },
  })
  await prisma.apiRateBucket.deleteMany({ where: { windowStart: { lt: new Date(now - 300_000) } } })
}
