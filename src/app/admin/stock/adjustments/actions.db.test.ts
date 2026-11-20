import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getAdjustDetail } from '@/lib/stock/adjust-queries'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  cancelAdjustAction,
  confirmAdjustAction,
  createAdjustAction,
  listAdjustStockOptionsAction,
} from './actions'

// 재고 실사·조정 (docs/decisions/0061)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture
let water = ''
let rice = ''

const receive = (locationId: bigint, itemId: bigint, qty: string) =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
    stockTransaction((tx) => receiveStock(tx, { address: { locationId, itemId }, qty })),
  )

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  water = String((await receive(f.a01, f.water, '100')).stockId)
  rice = String((await receive(f.a02, f.rice, '10')).stockId)
  signInAs(ALL, ['stock.adjustments.read', 'stock.adjustments.create'], 'worker')
})

afterAll(async () => {
  await prisma.$disconnect()
})

const qtyOf = async (id: string) =>
  (await prisma.stock.findUniqueOrThrow({ where: { id: BigInt(id) } })).qty.toString()

function ok<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

describe('실사·조정', () => {
  it('실사: 등록만으로는 그대로, 확정하면 (센 수량 − 그때 재고)만큼 바뀌고 이력에 사유', async () => {
    const created = ok(
      await createAdjustAction({
        type: 'COUNT',
        centerId: String(f.icn),
        reason: '정기 실사',
        remark: '',
        lines: [
          { stockId: water, qty: '97' },
          { stockId: rice, qty: '10' },
        ],
      }),
    )
    expect(created.adjustNo).toMatch(/^AJ\d{6}-\d{4}$/)
    expect(await qtyOf(water)).toBe('100')

    // 등록 뒤 재고가 바뀌어도(입고 +5) 확정 때 재고 기준으로 차이를 계산한다
    await receive(f.a01, f.water, '5')
    const detail = await getAdjustDetail(BigInt(created.id), ALL)
    expect(detail?.lines.map((l) => [l.systemQty, l.currentQty, l.changeQty])).toEqual([
      ['100', '105', '-8'],
      ['10', '10', '0'],
    ])

    // 확정은 확정 권한
    expect(await confirmAdjustAction({ id: created.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    signInAs(ALL, ['stock.adjustments.read', 'stock.adjustments.confirm'], 'manager')
    expect(ok(await confirmAdjustAction({ id: created.id }))).toMatchObject({ applied: 1 })
    expect([await qtyOf(water), await qtyOf(rice)]).toEqual(['97', '10'])
    const txn = await prisma.stockTxn.findFirstOrThrow({ where: { type: 'ADJUST' } })
    expect(txn).toMatchObject({ refType: 'ADJUSTMENT', createdBy: 'manager' })
    expect(txn.reason).toContain('정기 실사')
    const saved = await prisma.stockAdjust.findFirstOrThrow({
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    })
    expect(saved).toMatchObject({ status: 'CONFIRMED', confirmedBy: 'manager' })
    expect(saved.lines.map((l) => [l.appliedQty?.toString(), l.stockTxnId === null])).toEqual([
      ['-8', false],
      ['0', true],
    ])
    // 두 번 확정할 수 없다
    expect(await confirmAdjustAction({ id: created.id })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('조정: ±수량, 사유 필수, 재고보다 많이 빼면 확정 거부(아무것도 안 바뀜)', async () => {
    expect(
      await createAdjustAction({
        type: 'ADJUST',
        centerId: String(f.icn),
        reason: ' ',
        remark: '',
        lines: [{ stockId: water, qty: '-1' }],
      }),
    ).toMatchObject({ ok: false })
    expect(
      await createAdjustAction({
        type: 'ADJUST',
        centerId: String(f.icn),
        reason: '파손',
        remark: '',
        lines: [{ stockId: water, qty: '0' }],
      }),
    ).toMatchObject({ ok: false })
    const plus = ok(
      await createAdjustAction({
        type: 'ADJUST',
        centerId: String(f.icn),
        reason: '착오 정정',
        remark: '',
        lines: [
          { stockId: water, qty: '3' },
          { stockId: rice, qty: '-2.5' },
        ],
      }),
    )
    const tooMuch = ok(
      await createAdjustAction({
        type: 'ADJUST',
        centerId: String(f.icn),
        reason: '분실',
        remark: '',
        lines: [{ stockId: water, qty: '-500' }],
      }),
    )
    signInAs(ALL, ['stock.adjustments.read', 'stock.adjustments.confirm'], 'manager')
    ok(await confirmAdjustAction({ id: plus.id }))
    expect([await qtyOf(water), await qtyOf(rice)]).toEqual(['103', '7.5'])
    expect(await confirmAdjustAction({ id: tooMuch.id })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('재고가 부족') },
    })
    expect(await qtyOf(water)).toBe('103')
    expect(
      (await prisma.stockAdjust.findUniqueOrThrow({ where: { id: BigInt(tooMuch.id) } })).status,
    ).toBe('DRAFT')
  })

  it('소수 자리·다른 센터 재고·같은 재고 두 번은 등록 거부, 취소는 등록 상태만', async () => {
    const bad = (lines: { stockId: string; qty: string }[], centerId = String(f.icn)) =>
      createAdjustAction({ type: 'COUNT', centerId, reason: '실사', remark: '', lines })
    expect(await bad([{ stockId: water, qty: '1.5' }])).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('소수 0자리') },
    })
    expect(await bad([{ stockId: water, qty: '1' }], String(f.gmh))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('이 센터의 재고') },
    })
    expect(
      await bad([
        { stockId: water, qty: '1' },
        { stockId: water, qty: '2' },
      ]),
    ).toMatchObject({ ok: false })
    const created = ok(await bad([{ stockId: water, qty: '1' }]))
    ok(await cancelAdjustAction({ id: created.id }))
    expect(await cancelAdjustAction({ id: created.id })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await qtyOf(water)).toBe('100')
  })

  it('센터 직원은 소속 센터만, 재고 선택지는 그 센터의 재고 줄', async () => {
    signInAs({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] }, [
      'stock.adjustments.read',
      'stock.adjustments.create',
    ])
    expect(ok(await listAdjustStockOptionsAction({ centerId: String(f.icn) }))).toEqual([])
    expect(
      await createAdjustAction({
        type: 'COUNT',
        centerId: String(f.icn),
        reason: '실사',
        remark: '',
        lines: [{ stockId: water, qty: '1' }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    signInAs(ALL, ['stock.adjustments.create'])
    const options = ok(await listAdjustStockOptionsAction({ centerId: String(f.icn) }))
    expect(options.map((o) => [o.label, o.qty])).toEqual([
      ['GEN / A-01 · WATER', '100'],
      ['GEN / A-02 · RICE', '10'],
    ])
  })
})
