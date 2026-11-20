import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfirmWork } from '@/lib/inbound/receipt-queries'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { createAsnAction } from '../asn/actions'
import { addInspectionAction } from '../inspection/actions'
import { confirmReceiptAction } from './actions'

// 입고 확정 (docs/decisions/0057)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture
let asnId = ''
let lines: { water: string; milk: string }

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signInAs(ALL, undefined, 'kim')
  const created = await createAsnAction({
    shipperId: String(f.gana),
    centerId: String(f.icn),
    expectedOn: '2026-11-20',
    shipperRefNo: '',
    remark: '',
    lines: [
      { itemId: String(f.water), unit: 'EA', qty: '100', lotNo: '', expiryOn: '', remark: '' },
      { itemId: String(f.milk), unit: 'EA', qty: '50', lotNo: '', expiryOn: '', remark: '' },
    ],
  })
  if (!created.ok) throw new Error(created.error.message)
  asnId = created.data.id
  const rows = await prisma.asnLine.findMany({
    where: { asnId: BigInt(asnId) },
    orderBy: { lineNo: 'asc' },
  })
  lines = { water: String(rows[0].id), milk: String(rows[1].id) }
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function inspect(line: 'water' | 'milk', qty: string, lotNo = '') {
  const result = await addInspectionAction({
    asnLineId: lines[line],
    unit: 'EA',
    qty,
    defectQty: '',
    lotNo,
    expiryOn: line === 'milk' ? '2027-01-31' : '',
    remark: '',
  })
  if (!result.ok) throw new Error(result.error.message)
  return String(result.data.id)
}

const confirm = (items: { inspectionId: string; qty: string }[]) =>
  confirmReceiptAction({ asnId, lines: items, remark: '' })

describe('입고 확정', () => {
  it('부분 확정: 입고확정 문서·입고대기 재고·재고 이력·누적 수량, ASN은 부분확정', async () => {
    const water = await inspect('water', '100')
    const result = await confirm([{ inspectionId: water, qty: '60' }])
    expect(result).toMatchObject({
      ok: true,
      data: { receiptNo: expect.stringMatching(/^RC\d{6}-\d{4}$/), status: 'PARTIAL' },
    })

    const stock = await prisma.stock.findFirstOrThrow({ where: { itemId: f.water } })
    expect([stock.locationId, stock.qty.toString()]).toEqual([f.icnStaging, '60'])
    const txn = await prisma.stockTxn.findFirstOrThrow({ where: { stockId: stock.id } })
    expect(txn).toMatchObject({ type: 'RECEIVE', refType: 'RECEIPT', createdBy: 'kim' })
    expect(txn.refNo).toBe(result.ok ? result.data.receiptNo : '')
    expect((await prisma.inboundInspection.findFirstOrThrow()).confirmedQty.toString()).toBe('60')
    expect(
      (
        await prisma.asnLine.findUniqueOrThrow({ where: { id: BigInt(lines.water) } })
      ).confirmedQty.toString(),
    ).toBe('60')
    expect((await prisma.asn.findFirstOrThrow()).status).toBe('PARTIAL')

    // 나머지 40은 다음에 다시 확정할 수 있다
    const work = await getConfirmWork(BigInt(asnId), ALL)
    expect(work?.inspections.map((i) => i.availableQty)).toEqual(['40'])
    expect(work?.receipts).toHaveLength(1)
  })

  it('모든 줄이 예정 이상이면 확정완료, 초과 입고도 확정한다, 로트별 재고 주소', async () => {
    const water = await inspect('water', '120')
    const milk1 = await inspect('milk', '30', 'L1')
    const milk2 = await inspect('milk', '20', 'L2')
    const result = await confirm([
      { inspectionId: water, qty: '120' },
      { inspectionId: milk1, qty: '30' },
      { inspectionId: milk2, qty: '20' },
    ])
    expect(result).toMatchObject({ ok: true, data: { status: 'COMPLETED' } })
    const stocks = await prisma.stock.findMany({ orderBy: [{ itemId: 'asc' }, { lotNo: 'asc' }] })
    expect(stocks.map((s) => [s.lotNo, s.qty.toString()])).toEqual([
      [null, '120'],
      ['L1', '30'],
      ['L2', '20'],
    ])
  })

  it('확정 가능 수량보다 많거나, 다른 ASN의 검수거나, 마감된 ASN이면 거부 (아무것도 저장 안 함)', async () => {
    const water = await inspect('water', '10')
    expect(await confirm([{ inspectionId: water, qty: '11' }])).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('확정할 수 있는 수량') },
    })
    expect(await confirm([{ inspectionId: '999999', qty: '1' }])).toMatchObject({ ok: false })
    await prisma.asn.update({
      where: { id: BigInt(asnId) },
      data: { status: 'CLOSED', closeReason: '취소', closedAt: new Date(), closedBy: 'kim' },
    })
    expect(await confirm([{ inspectionId: water, qty: '1' }])).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('마감된 ASN') },
    })
    expect(await prisma.stock.count()).toBe(0)
    expect(await prisma.inboundReceipt.count()).toBe(0)
  })

  it('같은 검수를 동시에 확정해도 검수 수량을 넘지 않는다', async () => {
    const water = await inspect('water', '10')
    const results = await Promise.all(
      Array.from({ length: 5 }, () => confirm([{ inspectionId: water, qty: '4' }])),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(2)
    expect((await prisma.stock.findFirstOrThrow()).qty.toString()).toBe('8')
    expect((await prisma.inboundInspection.findFirstOrThrow()).confirmedQty.toString()).toBe('8')
  })

  it('확정 권한이 필요하다', async () => {
    const water = await inspect('water', '10')
    signInAs(ALL, ['inbound.confirm.read'])
    expect(await confirm([{ inspectionId: water, qty: '1' }])).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
