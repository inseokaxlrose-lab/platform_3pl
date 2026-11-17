import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, operatorFilter, type DataScope } from '@/lib/scope/data-scope'

// API 호출 이력 화면 조회 (docs/decisions/0081 ②) — 화면 조회 함수라 운영사를 직접 거른다

const DAY = 86_400_000

// 한국 날짜 기준 오늘 0시
function startOfKstToday(now = new Date()) {
  const day = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  return new Date(`${day}T00:00:00+09:00`)
}

// 상단 요약 (정의서 10번): 오늘 호출 수, 실패율, 429 발생 수, 화주별 실패 상위 5곳
export async function getApiLogSummary(scope: DataScope, now = new Date()) {
  if (scope.kind !== 'ALL') return null
  const where = { ...operatorFilter(scope), requestedAt: { gte: startOfKstToday(now) } }
  const [total, fail, limited, topFail] = await Promise.all([
    prisma.apiRequestLog.count({ where }),
    prisma.apiRequestLog.count({ where: { ...where, result: 'FAIL' } }),
    prisma.apiRequestLog.count({ where: { ...where, httpStatus: 429 } }),
    prisma.apiRequestLog.groupBy({
      by: ['shipperId'],
      where: { ...where, result: { in: ['FAIL', 'PARTIAL'] }, shipperId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { shipperId: 'desc' } },
      take: 5,
    }),
  ])
  const shippers = await prisma.shipper.findMany({
    where: { id: { in: topFail.flatMap((t) => (t.shipperId ? [t.shipperId] : [])) } },
    select: { id: true, code: true },
  })
  const codeOf = new Map(shippers.map((s) => [s.id, s.code]))
  return {
    total,
    fail,
    // 실패율 (%, 소수 1자리)
    failRate: total === 0 ? 0 : Math.round((fail / total) * 1000) / 10,
    limited,
    topFail: topFail.map((t) => ({
      shipperId: String(t.shipperId),
      code: codeOf.get(t.shipperId!) ?? '-',
      count: t._count._all,
    })),
  }
}

export type ApiLogSummary = NonNullable<Awaited<ReturnType<typeof getApiLogSummary>>>

// 상세 (요청·응답 본문은 저장할 때 개인정보를 가린 값, 90일 뒤 비워진다)
export async function getApiLogDetail(requestId: string, scope: DataScope) {
  if (scope.kind !== 'ALL') return null
  const log = await prisma.apiRequestLog.findUnique({
    where: { requestId },
    include: { items: { orderBy: { seq: 'asc' } } },
  })
  if (!log || log.operatorId === null || !isInScope(scope, log, {})) return null
  const [shipper, key] = await Promise.all([
    log.shipperId
      ? prisma.shipper.findUnique({
          where: { id: log.shipperId },
          select: { id: true, code: true, name: true },
        })
      : null,
    log.apiClientId
      ? prisma.apiClient.findUnique({
          where: { id: log.apiClientId },
          select: { id: true, name: true, keyPrefix: true, env: true },
        })
      : null,
  ])
  const pretty = (body: string | null) => {
    if (!body) return null
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }
  return textIds({
    ...log,
    requestBody: pretty(log.requestBody),
    responseBody: pretty(log.responseBody),
    bodyPurged:
      !log.requestBody && !log.responseBody && Date.now() - log.requestedAt.getTime() > 90 * DAY,
    shipper,
    key,
  })
}

export type ApiLogDetail = NonNullable<Awaited<ReturnType<typeof getApiLogDetail>>>
