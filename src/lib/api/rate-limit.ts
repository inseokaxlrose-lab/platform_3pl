import 'server-only'
import { prisma } from '@/lib/prisma'

// 호출 한도 (docs/decisions/0081): 키별 1분 고정 구간 카운터 (PostgreSQL — 서버가 여러 대여도 맞게 센다)
// 구간 시작 시각마다 한 줄, 한 번 부를 때마다 1 올리고 올린 값을 돌려받는다 (한 문장이라 동시에 와도 안전)

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  // 다음 구간까지 남은 초 (429 응답의 Retry-After)
  retryAfter: number
}

export async function consumeRateLimit(
  apiClientId: bigint,
  limit: number,
  now = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000)
  const rows = await prisma.$queryRaw<{ req_cnt: number }[]>`
    INSERT INTO tb_api_rate_bucket (api_client_id, window_start, req_cnt)
    VALUES (${apiClientId}, ${windowStart}, 1)
    ON CONFLICT (api_client_id, window_start)
    DO UPDATE SET req_cnt = tb_api_rate_bucket.req_cnt + 1
    RETURNING req_cnt`
  const count = Number(rows[0].req_cnt)
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: Math.max(1, Math.ceil((windowStart.getTime() + 60_000 - now.getTime()) / 1000)),
  }
}

// 응답 헤더 (정의서: X-RateLimit-Limit·X-RateLimit-Remaining, 429면 Retry-After)
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    ...(!result.allowed && { 'Retry-After': String(result.retryAfter) }),
  }
}
