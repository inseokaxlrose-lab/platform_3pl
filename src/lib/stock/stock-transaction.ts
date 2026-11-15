import { prisma, type Tx } from '@/lib/prisma'

// 재고를 바꾸는 트랜잭션 도우미 (docs/decisions/0046)
// 재고 변경 공통 함수(stock-change.ts)를 부르는 업무 저장(입고 확정 등)은 prisma.$transaction 대신 이것을 쓴다
//
// 왜 필요한가: 한 트랜잭션에서 여러 재고 줄을 바꾸면, 두 요청이 서로 반대 순서로 줄을 잠가
// 서로를 기다리는 교착(데드락)이 생길 수 있다. PostgreSQL은 이를 알아채고 한쪽을 실패시킨다
// → 실패한 쪽을 처음부터(트랜잭션 전체) 짧게 쉬었다가 다시 실행한다. 이미 취소됐으므로 두 번 저장되지 않는다
//
// 다시 시도하는 오류: 교착(40P01), 직렬화 실패(40001)
// Prisma가 알려 주는 모양은 쿼리 종류마다 다르다 — 일반 쿼리는 P2034, 직접 SQL(줄 잠금)은 P2010 +
// meta.driverAdapterError.cause { originalCode: '40P01', kind: 'TransactionWriteConflict' } (테스트로 확인)
// → 코드 하나에 기대지 않고 오류 안쪽까지 따라가며 찾는다
// 업무 오류(재고 부족 등 ActionError)는 다시 해도 같으므로 그대로 던진다

export const STOCK_TX_MAX_ATTEMPTS = 3

const RETRYABLE_DB_CODES = ['40P01', '40001']

// 오류(와 그 원인들) 안에 다시 시도할 만한 표시가 있는지
export function isRetryableTxError(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const e = current as {
      code?: unknown
      kind?: unknown
      originalCode?: unknown
      message?: unknown
      meta?: unknown
      cause?: unknown
    }
    if (e.code === 'P2034' || e.kind === 'TransactionWriteConflict') return true
    if (
      RETRYABLE_DB_CODES.includes(String(e.code)) ||
      RETRYABLE_DB_CODES.includes(String(e.originalCode))
    ) {
      return true
    }
    if (typeof e.message === 'string' && /deadlock detected|could not serialize/i.test(e.message)) {
      return true
    }
    // Prisma 오류는 meta.driverAdapterError 안에, 일반 오류는 cause 안에 원래 오류를 담는다
    const meta = e.meta as { driverAdapterError?: unknown } | undefined
    current = meta?.driverAdapterError ?? e.cause
  }
  return false
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function stockTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? STOCK_TX_MAX_ATTEMPTS
  for (let attempt = 1; ; attempt++) {
    try {
      // 잠금을 기다리는 시간이 있어 기본값(연결 대기 2초, 실행 5초)보다 넉넉히
      return await prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 })
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableTxError(error)) throw error
      // 같이 실패한 요청들이 또 동시에 부딪히지 않게 조금씩 다르게 쉰다 (시도할수록 길게)
      await sleep(attempt * 20 + Math.floor(Math.random() * 50))
    }
  }
}
