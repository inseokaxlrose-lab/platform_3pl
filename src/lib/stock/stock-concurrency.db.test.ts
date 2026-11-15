import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { prisma, type Tx } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { adjustStock, moveStock, receiveStock } from './stock-change'
import { isRetryableTxError, stockTransaction } from './stock-transaction'
import { withStockWrite } from './stock-write-guard'

// 마이너스 재고 방지 · 동시 처리 안전성 (docs/decisions/0046)
// 여러 요청이 "진짜로 동시에"(서로 다른 DB 연결, 서로 다른 트랜잭션) 같은 재고를 바꿔도
// 수량이 맞고 마이너스가 되지 않는지 확인한다

let loc: { a: bigint; b: bigint }
let itemId = 0n

beforeEach(async () => {
  await resetDatabase()
  const center = await createTestCenter('ICN')
  const inbound = await ensureCenterDefaults(prisma, center.id)
  const a = await prisma.location.findFirstOrThrow({ where: { warehouseId: inbound.id } })
  const b = await prisma.location.create({
    data: { operatorId: TEST_OPERATOR_ID, warehouseId: inbound.id, code: 'B' },
  })
  const shipper = await createTestShipper('GANA')
  await prisma.shipper.update({
    where: { id: shipper.id },
    data: { centers: { create: [{ centerId: center.id }] } },
  })
  const unit = await prisma.unit.create({
    data: { operatorId: TEST_OPERATOR_ID, code: 'EA', name: '개', kind: 'BASE' },
  })
  itemId = (
    await prisma.item.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        shipperId: shipper.id,
        systemCode: 'IT-T-1',
        code: 'WATER',
        name: '생수',
        baseUnitId: unit.id,
      },
    })
  ).id
  loc = { a: a.id, b: b.id }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// 서버 액션처럼: 작업자·운영사 출입증 + 재고 트랜잭션 도우미
const run = <T>(fn: (tx: Tx) => Promise<T>, maxAttempts?: number) =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
    stockTransaction(fn, { maxAttempts }),
  )

const at = (locationId: bigint) => ({ locationId, itemId })

const qtyOf = async (locationId: bigint) =>
  (await prisma.stock.findFirst({ where: { locationId, itemId } }))?.qty.toString() ?? null

// 결과를 성공·실패로 나눠 센다 (실패 메시지도 모은다)
async function settle(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks)
  return {
    ok: results.filter((r) => r.status === 'fulfilled').length,
    errors: results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason?.message)] : [])),
  }
}

// 재고 줄마다 이력 변동 합계 = 지금 수량
async function expectTxnSumsMatch() {
  const stocks = await prisma.stock.findMany()
  const sums = await prisma.stockTxn.groupBy({ by: ['stockId'], _sum: { qtyChange: true } })
  const sumOf = new Map(sums.map((s) => [s.stockId, s._sum.qtyChange?.toString() ?? '0']))
  for (const s of stocks) expect(sumOf.get(s.id) ?? '0').toBe(s.qty.toString())
}

describe('동시에 들어와도 수량이 맞다', () => {
  it('아직 없는 주소에 입고 20건이 동시에 → 재고 줄은 한 줄, 수량은 합계', async () => {
    const result = await settle(
      Array.from({ length: 20 }, () =>
        run((tx) => receiveStock(tx, { address: at(loc.a), qty: '5' })),
      ),
    )
    expect(result).toEqual({ ok: 20, errors: [] })
    expect(await prisma.stock.count()).toBe(1)
    expect(await qtyOf(loc.a)).toBe('100')
    expect(await prisma.stockTxn.count()).toBe(20)
    await expectTxnSumsMatch()
  })

  it('재고 10에서 1씩 빼는 요청 20건이 동시에 → 정확히 10건 성공·10건 부족, 수량 0 (마이너스 없음)', async () => {
    await run((tx) => adjustStock(tx, { address: at(loc.a), qty: '10', reason: '실사' }))
    const result = await settle(
      Array.from({ length: 20 }, () =>
        run((tx) => adjustStock(tx, { address: at(loc.a), qty: '-1', reason: '파손' })),
      ),
    )
    expect(result.ok).toBe(10)
    expect(result.errors).toHaveLength(10)
    expect(result.errors.every((m) => m.includes('재고가 부족'))).toBe(true)
    expect(await qtyOf(loc.a)).toBe('0')
    // 변동 후 수량은 한 번도 음수가 아니었다 (10 → 9 → … → 0, 겹치지 않음)
    const afters = await prisma.stockTxn.findMany({
      where: { type: 'ADJUST', qtyChange: { lt: 0 } },
      select: { qtyAfter: true },
    })
    expect(afters.map((t) => Number(t.qtyAfter.toString())).sort((x, y) => x - y)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    await expectTxnSumsMatch()
  })

  it('할당이 있으면 동시에 빼도 할당분은 남는다 (수량 10, 할당 4 → 6건만 성공)', async () => {
    const { stockId } = await run((tx) =>
      adjustStock(tx, { address: at(loc.a), qty: '10', reason: '실사' }),
    )
    await withStockWrite(() =>
      prisma.stock.update({ where: { id: stockId }, data: { allocatedQty: '4' } }),
    )
    const result = await settle(
      Array.from({ length: 10 }, () =>
        run((tx) => moveStock(tx, { from: at(loc.a), toLocationId: loc.b, qty: '1' })),
      ),
    )
    expect(result.ok).toBe(6)
    expect([await qtyOf(loc.a), await qtyOf(loc.b)]).toEqual(['4', '6'])
    await expectTxnSumsMatch()
  })

  it('A→B와 B→A 이동이 동시에 섞여도 교착 없이 끝나고 전체 수량은 그대로', async () => {
    await run((tx) => adjustStock(tx, { address: at(loc.a), qty: '50', reason: '실사' }))
    await run((tx) => adjustStock(tx, { address: at(loc.b), qty: '50', reason: '실사' }))
    const result = await settle(
      Array.from({ length: 20 }, (_, i) =>
        run(
          (tx) =>
            moveStock(tx, {
              from: at(i % 2 ? loc.a : loc.b),
              toLocationId: i % 2 ? loc.b : loc.a,
              qty: '3',
            }),
          1, // 다시 시도 없이도 교착이 없어야 한다 (함수 하나는 키 순서로 잠근다)
        ),
      ),
    )
    expect(result).toEqual({ ok: 20, errors: [] })
    // 10건씩 서로 반대로 3개 → 제자리
    expect([await qtyOf(loc.a), await qtyOf(loc.b)]).toEqual(['50', '50'])
    await expectTxnSumsMatch()
  })

  it('입고·이동·조정을 섞어 동시에 → 이력 합계 = 수량, 마이너스 없음', async () => {
    await run((tx) => receiveStock(tx, { address: at(loc.a), qty: '30' }))
    const tasks: Promise<unknown>[] = []
    for (let i = 0; i < 10; i++) {
      tasks.push(run((tx) => receiveStock(tx, { address: at(loc.a), qty: '2' })))
      tasks.push(run((tx) => moveStock(tx, { from: at(loc.a), toLocationId: loc.b, qty: '4' })))
      tasks.push(run((tx) => adjustStock(tx, { address: at(loc.b), qty: '-1', reason: '파손' })))
    }
    const result = await settle(tasks)
    // 실패가 있다면 재고 부족뿐이다 (순서에 따라 B가 아직 비어 있을 수 있다)
    expect(result.errors.every((m) => m.includes('재고가 부족'))).toBe(true)
    const total = (await prisma.stock.findMany()).reduce((sum, s) => sum + Number(s.qty), 0)
    const failedAdjusts = result.errors.length // 이동은 A가 늘 넉넉해 실패하지 않는다
    expect(total).toBe(30 + 20 - (10 - failedAdjusts))
    expect((await prisma.stock.findMany()).every((s) => Number(s.qty) >= 0)).toBe(true)
    await expectTxnSumsMatch()
  })
})

describe('여러 줄을 한 트랜잭션에서 바꿀 때의 교착 → 자동 다시 시도 (사용자 결정)', () => {
  // 교착을 일부러 만든다: 요청 1은 A를 잠그고 B를, 요청 2는 B를 잠그고 A를 기다린다
  // (둘 다 첫 줄을 잠근 것을 확인한 뒤에 두 번째 줄로 가도록 약속 신호를 쓴다)
  async function crossLock(maxAttempts: number) {
    await run((tx) => adjustStock(tx, { address: at(loc.a), qty: '10', reason: '실사' }))
    await run((tx) => adjustStock(tx, { address: at(loc.b), qty: '10', reason: '실사' }))
    let lockedCount = 0
    let release!: () => void
    const bothLocked = new Promise<void>((resolve) => (release = resolve))
    const errors: unknown[] = []
    const job = (first: bigint, second: bigint) =>
      run(async (tx) => {
        await adjustStock(tx, { address: at(first), qty: '-1', reason: '교차' })
        if (++lockedCount === 2) release()
        await bothLocked
        await adjustStock(tx, { address: at(second), qty: '-1', reason: '교차' })
      }, maxAttempts).catch((error: unknown) => errors.push(error))
    await Promise.all([job(loc.a, loc.b), job(loc.b, loc.a)])
    return errors
  }

  it('다시 시도하지 않으면 한쪽이 교착으로 실패한다 (다시 시도할 오류로 알아본다)', async () => {
    const errors = await crossLock(1)
    expect(errors).toHaveLength(1)
    // 실제 모양: P2010 + meta.driverAdapterError.cause.originalCode '40P01'
    expect(errors[0]).toMatchObject({
      meta: { driverAdapterError: { cause: { originalCode: '40P01' } } },
    })
    expect(isRetryableTxError(errors[0])).toBe(true)
    // 실패한 쪽은 전부 취소: 성공한 한 건만 반영 (A 9, B 9)
    expect([await qtyOf(loc.a), await qtyOf(loc.b)]).toEqual(['9', '9'])
  })

  it('stockTransaction은 교착으로 실패한 쪽을 처음부터 다시 실행해 둘 다 성공한다', async () => {
    expect(await crossLock(3)).toEqual([])
    expect([await qtyOf(loc.a), await qtyOf(loc.b)]).toEqual(['8', '8'])
    // 다시 실행해도 두 번 저장되지 않는다: 교차 이력은 정확히 4줄
    expect(await prisma.stockTxn.count({ where: { reason: '교차' } })).toBe(4)
    await expectTxnSumsMatch()
  })

  it('업무 오류(재고 부족)는 다시 시도하지 않는다', () => {
    expect(isRetryableTxError(new Error('재고가 부족합니다'))).toBe(false)
    expect(isRetryableTxError({ code: 'P2034' })).toBe(true)
    expect(isRetryableTxError(new Error('x', { cause: { originalCode: '40P01' } }))).toBe(true)
  })
})
