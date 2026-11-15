import { AsyncLocalStorage } from 'node:async_hooks'

// 재고 표 쓰기 허가증 (docs/decisions/0045)
// 재고·재고 이력은 재고 변경 공통 함수(stock-change.ts)로만 바꾼다 (CLAUDE.md 절대 규칙)
// prisma.ts가 재고 표의 등록·수정·삭제를 볼 때 이 허가증이 없으면 오류를 낸다
// → 다른 코드가 실수로 prisma.stock.update(...)를 부르면 바로 드러난다

// 다른 import가 없는 작은 파일이라 prisma.ts가 가져가도 순환 참조가 생기지 않는다

const storage = new AsyncLocalStorage<true>()

// 재고 표를 바꿔도 되는 모델 (Prisma 모델 이름)
export const STOCK_MODELS: ReadonlySet<string> = new Set(['Stock', 'StockTxn'])

// fn 안에서만 재고 표를 바꿀 수 있다
// 쓰는 곳: 재고 변경 공통 함수, DB 규칙 자체를 확인하는 테스트(stock-model.db.test.ts)
export async function withStockWrite<T>(fn: () => T | PromiseLike<T>): Promise<T> {
  // 결과를 안에서 기다린다: Prisma 쿼리는 await할 때 실행되므로 밖에서 기다리면 허가증이 사라진다
  return storage.run(true, async () => await fn())
}

// 재고 표 쓰기가 허가됐는지 검사 (prisma.ts에서 부른다)
export function assertStockWrite(model: string, operation: string) {
  if (!STOCK_MODELS.has(model) || storage.getStore()) return
  throw new Error(
    `[${model}.${operation}] 재고는 재고 변경 공통 함수(src/lib/stock/stock-change.ts)로만 바꿀 수 있습니다.`,
  )
}
