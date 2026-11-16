import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { adjustStock, moveStock, receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listStockHistoryAction } from './actions'

// 재고 이력 조회 (docs/decisions/0062)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture

const run = <T>(fn: Parameters<typeof stockTransaction<T>>[0]) =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () => stockTransaction(fn))

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signInAs(ALL)
  const at = (locationId: bigint) => ({ locationId, itemId: f.water })
  await run((tx) =>
    receiveStock(tx, {
      address: at(f.icnStaging),
      qty: '100',
      ref: { refType: 'RECEIPT', refNo: 'RC-1' },
    }),
  )
  await run((tx) =>
    moveStock(tx, {
      from: at(f.icnStaging),
      toLocationId: f.a01,
      qty: '60',
      ref: { refType: 'PUTAWAY', refNo: 'AS-1' },
    }),
  )
  await run((tx) =>
    adjustStock(tx, {
      address: at(f.a01),
      qty: '-2',
      reason: '파손',
      ref: { refType: 'ADJUSTMENT', refNo: 'AJ-1' },
    }),
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})

const list = async (filters: Record<string, string> = {}, search = '') => {
  const result = await listStockHistoryAction({ ...createDataGridState({ search }), filters })
  if (!result.ok) throw new Error(result.error.message)
  return result.data.rows
}

describe('재고 이력', () => {
  it('최근 것부터: 유형·로케이션·변동·변동 후·원본 문서·사유·처리자', async () => {
    const rows = await list()
    expect(rows.map((r) => [r.typeLabel, r.location, r.qtyChange, r.qtyAfter, r.ref])).toEqual([
      ['조정', 'GEN / A-01', '-2', '58', '실사·조정 AJ-1'],
      ['이동(들어옴)', 'GEN / A-01', '60', '60', '적치 AS-1'],
      ['이동(나감)', 'INBOUND / DEFAULT', '-60', '40', '적치 AS-1'],
      ['입고', 'INBOUND / DEFAULT', '100', '100', '입고확정 RC-1'],
    ])
    expect(rows[0]).toMatchObject({ reason: '파손', createdBy: 'kim', itemCode: 'WATER' })
    expect(rows[1].groupId).toBe(rows[2].groupId)
  })

  it('조건: 유형 여러 개·원본 문서·검색어·기간', async () => {
    expect((await list({ type: 'MOVE_OUT,MOVE_IN' })).map((r) => r.type)).toEqual([
      'MOVE_IN',
      'MOVE_OUT',
    ])
    expect((await list({ ref: 'RECEIPT' })).map((r) => r.type)).toEqual(['RECEIVE'])
    expect((await list({}, 'AJ-1')).map((r) => r.type)).toEqual(['ADJUST'])
    expect(await list({ txnAt: '2000-01-01~2000-01-02' })).toEqual([])
  })

  it('범위·엑셀 권한', async () => {
    signInAs({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect(await list()).toEqual([])
    signInAs(ALL, ['stock.history.read'])
    expect(
      await listStockHistoryAction({ ...createDataGridState(), filters: {}, exportAll: true }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
