import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { adjustStock, receiveStock } from '@/lib/stock/stock-change'
import { kstToday } from '@/lib/stock/expiry'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listStockAction } from './actions'

// 재고 조회 (docs/decisions/0060)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture

// 오늘 + n일 'YYYY-MM-DD'
const plus = (days: number) => {
  const d = new Date(`${kstToday()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const receive = (
  locationId: bigint,
  itemId: bigint,
  qty: string,
  lotNo?: string,
  expiryOn?: string,
) =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
    stockTransaction((tx) =>
      receiveStock(tx, { address: { locationId, itemId, lotNo, expiryOn }, qty }),
    ),
  )

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signInAs(ALL)
  await prisma.item.update({ where: { id: f.milk }, data: { expiryAlertDays: 30 } })
  // 생수: A-01 3,000 · A-02 30 / 우유: A-01 로트 M1(10일 남음) 40, A-02 로트 M2(90일) 20, 로트 M0(만료) 5
  await receive(f.a01, f.water, '3000')
  await receive(f.a02, f.water, '30')
  await receive(f.a01, f.milk, '40', 'M1', plus(10))
  await receive(f.a02, f.milk, '20', 'M2', plus(90))
  await receive(f.a02, f.milk, '5', 'M0', plus(-1))
})

afterAll(async () => {
  await prisma.$disconnect()
})

const list = async (filters: Record<string, string>) => {
  const result = await listStockAction({ ...createDataGridState({ pageSize: 50 }), filters })
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

describe('재고 조회', () => {
  it('위치별: 재고 줄마다 센터·창고·로케이션·로트, 수량·할당·가용·환산', async () => {
    const { rows, rowCount } = await list({})
    expect(rowCount).toBe(5)
    const water = rows.find((r) => r.location === 'A-01' && r.itemCode === 'WATER')
    expect(water).toMatchObject({
      center: '이천센터 (ICN)',
      warehouse: 'GEN (GEN)',
      qty: '3000',
      allocatedQty: '0',
      availableQty: '3000',
      packs: '2 PLT · 5 BOX',
    })
  })

  it('품목별: 화주사+품목 합계, 재고 위치 수', async () => {
    const { rows } = await list({ view: 'item' })
    expect(rows.map((r) => [r.itemCode, r.qty, r.locationCount, r.packs])).toEqual([
      ['WATER', '3030', 2, '2 PLT · 6 BOX · 6 EA'],
      ['MILK', '65', 3, null],
    ])
  })

  it('로트·유통기한별: 임박(품목 기준 30일)·만료 표시, 조건으로 거르기', async () => {
    const { rows } = await list({ view: 'lot', shipper: String(f.gana) })
    const milk = Object.fromEntries(
      rows.filter((r) => r.itemCode === 'MILK').map((r) => [r.lotNo, [r.state, r.daysLeft]]),
    )
    expect(milk).toEqual({ M0: ['EXPIRED', -1], M1: ['SOON', 10], M2: ['OK', 90] })
    expect((await list({ view: 'lot', expiry: 'SOON' })).rows.map((r) => r.lotNo)).toEqual(['M1'])
    const expired = await list({ expiry: 'EXPIRED' })
    expect([expired.rowCount, expired.rows[0].lotNo]).toEqual([1, 'M0'])
  })

  it('수량 0은 기본으로 빼고, 조건으로 포함', async () => {
    await runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
      stockTransaction((tx) =>
        adjustStock(tx, {
          address: { locationId: f.a02, itemId: f.water },
          qty: '-30',
          reason: '파손',
        }),
      ),
    )
    expect((await list({})).rowCount).toBe(4)
    expect((await list({ zero: 'Y' })).rowCount).toBe(5)
  })

  it('범위·검색어·엑셀 권한', async () => {
    expect((await list({ keyword: '' })).rowCount).toBe(5)
    const searched = await listStockAction({
      ...createDataGridState({ search: 'M1' }),
      filters: {},
    })
    expect(searched.ok && searched.data.rows.map((r) => r.lotNo)).toEqual(['M1'])
    signInAs({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect((await list({})).rowCount).toBe(0)
    signInAs(ALL, ['stock.inventory.read'])
    expect(
      await listStockAction({ ...createDataGridState(), filters: {}, exportAll: true }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
