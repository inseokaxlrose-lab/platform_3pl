import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listPortalStockAction } from './actions'

// 화주 포털 · 내 재고 (docs/decisions/0063)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

let f: InboundFixture

const receive = (locationId: bigint, itemId: bigint, qty: string) =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
    stockTransaction((tx) => receiveStock(tx, { address: { locationId, itemId }, qty })),
  )

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  await receive(f.a01, f.water, '1500')
  await receive(f.b01, f.daraItem, '7')
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('화주 포털 내 재고', () => {
  it('자기 화주사 재고만 (화면이 다른 화주사를 보내도 무시), 품목별 환산', async () => {
    signInAs({ kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.gana }, [
      'portal.stock.read',
    ])
    const result = await listPortalStockAction({
      ...createDataGridState(),
      filters: { view: 'item', shipper: String(f.dara) },
    })
    expect(result.ok && result.data.rows.map((r) => [r.itemCode, r.qty, r.packs])).toEqual([
      ['WATER', '1500', '1 PLT · 2 BOX · 12 EA'],
    ])
  })

  it('화주사 사용자만, 엑셀은 엑셀 권한', async () => {
    signInAs({ kind: 'ALL', operatorId: TEST_OPERATOR_ID }, ['portal.stock.read'])
    expect(await listPortalStockAction({ ...createDataGridState(), filters: {} })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    signInAs({ kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.gana }, [
      'portal.stock.read',
    ])
    expect(
      await listPortalStockAction({ ...createDataGridState(), filters: {}, exportAll: true }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
