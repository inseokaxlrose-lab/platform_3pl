import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { IDEMPOTENCY_HOURS } from './api-codes'
import { ApiError } from './api-errors'

// 멱등 처리 (docs/decisions/0081): Idempotency-Key 헤더가 있는 쓰기 요청
// - 같은 키 + 같은 본문 → 처음 응답을 그대로 돌려준다 (다시 처리하지 않는다)
// - 같은 키 + 다른 본문 → 409 IDEMPOTENCY_CONFLICT
// - 헤더가 없어도 화주 문서번호 기준 중복 처리는 각 리소스 API가 항상 한다 (DUPLICATE)

export const hashBody = (body: string) => createHash('sha256').update(body).digest('hex')

export type StoredResponse = { status: number; body: string; requestId: string }

// 저장된 응답 찾기 (24시간 안). 본문이 다르면 오류
export async function findIdempotentResponse(
  apiClientId: bigint,
  idempotencyKey: string,
  body: string,
): Promise<StoredResponse | null> {
  const since = new Date(Date.now() - IDEMPOTENCY_HOURS * 3600_000)
  const found = await prisma.apiIdempotency.findUnique({
    where: { apiClientId_idempotencyKey: { apiClientId, idempotencyKey } },
  })
  if (!found || found.createdAt < since) return null
  if (found.requestHash !== hashBody(body)) throw new ApiError('IDEMPOTENCY_CONFLICT')
  return { status: found.httpStatus, body: found.responseBody, requestId: found.requestId }
}

// 처리한 응답 저장 (같은 키가 동시에 두 번 오면 먼저 저장한 쪽이 남는다)
export async function saveIdempotentResponse(
  apiClientId: bigint,
  idempotencyKey: string,
  body: string,
  response: StoredResponse,
) {
  const since = new Date(Date.now() - IDEMPOTENCY_HOURS * 3600_000)
  // 24시간 지난 같은 키는 지우고 새로 저장
  await prisma.apiIdempotency.deleteMany({
    where: { apiClientId, idempotencyKey, createdAt: { lt: since } },
  })
  await prisma.apiIdempotency.createMany({
    data: [
      {
        apiClientId,
        idempotencyKey,
        requestHash: hashBody(body),
        requestId: response.requestId,
        httpStatus: response.status,
        responseBody: response.body,
      },
    ],
    skipDuplicates: true,
  })
}
