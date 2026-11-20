import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPutawayWork } from '@/lib/inbound/putaway-queries'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { versionOf } from '@/test/factories'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { closeAsnAction, createAsnAction } from '../asn/actions'
import { confirmReceiptAction } from '../confirm/actions'
import { addInspectionAction } from '../inspection/actions'
import { registerPutawayAction } from './actions'

// 적치 (docs/decisions/0058)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture
let asnId = ''
let receiptLineId = ''

const ok = <T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }) => {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// ASN 예정 100 → 검수 100 → confirmQty만큼 확정
async function prepare(confirmQty: string) {
  const asn = ok(
    await createAsnAction({
      shipperId: String(f.gana),
      centerId: String(f.icn),
      expectedOn: '2026-11-20',
      shipperRefNo: '',
      remark: '',
      lines: [
        { itemId: String(f.water), unit: 'EA', qty: '100', lotNo: '', expiryOn: '', remark: '' },
      ],
    }),
  )
  asnId = asn.id
  const line = await prisma.asnLine.findFirstOrThrow({ where: { asnId: BigInt(asnId) } })
  const inspection = ok(
    await addInspectionAction({
      asnLineId: String(line.id),
      unit: 'EA',
      qty: '100',
      defectQty: '',
      lotNo: '',
      expiryOn: '',
      remark: '',
    }),
  )
  ok(
    await confirmReceiptAction({
      asnId,
      lines: [{ inspectionId: String(inspection.id), qty: confirmQty }],
      remark: '',
    }),
  )
  receiptLineId = String((await prisma.inboundReceiptLine.findFirstOrThrow()).id)
}

const putaway = (toLocationId: bigint, qty: string) =>
  registerPutawayAction({
    asnId,
    lines: [{ receiptLineId, toLocationId: String(toLocationId), qty }],
  })

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signInAs(ALL, undefined, 'lee')
})

afterAll(async () => {
  await prisma.$disconnect()
})

const qtyAt = async (locationId: bigint) =>
  (await prisma.stock.findFirst({ where: { locationId, itemId: f.water } }))?.qty.toString() ?? null

describe('적치', () => {
  it('부분 적치: 입고대기 → 보관 로케이션, 이동 이력 두 줄(원본 PUTAWAY), 누적, 부분적치', async () => {
    await prepare('100')
    expect(await putaway(f.a01, '60')).toMatchObject({
      ok: true,
      data: { count: 1, putawayStatus: 'PARTIAL' },
    })
    expect([await qtyAt(f.icnStaging), await qtyAt(f.a01)]).toEqual(['40', '60'])
    const record = await prisma.putaway.findFirstOrThrow()
    expect(record).toMatchObject({
      fromLocationId: f.icnStaging,
      toLocationId: f.a01,
      createdBy: 'lee',
    })
    const txns = await prisma.stockTxn.findMany({
      where: { groupId: record.txnGroupId },
      orderBy: { id: 'asc' },
    })
    expect(txns.map((t) => [t.type, t.qtyChange.toString(), t.refType])).toEqual([
      ['MOVE_OUT', '-60', 'PUTAWAY'],
      ['MOVE_IN', '60', 'PUTAWAY'],
    ])
    expect((await prisma.inboundReceiptLine.findFirstOrThrow()).putawayQty.toString()).toBe('60')
    expect((await prisma.asnLine.findFirstOrThrow()).putawayQty.toString()).toBe('60')

    // 남은 40을 다른 로케이션으로 → 입고가 끝났으므로(확정완료) 적치완료
    expect(await putaway(f.a02, '40')).toMatchObject({ ok: true, data: { putawayStatus: 'DONE' } })
    expect(await qtyAt(f.icnStaging)).toBe('0')
    const work = await getPutawayWork(BigInt(asnId), ALL)
    expect(work?.pending).toEqual([])
    expect(work?.history.map((h) => [h.qty, h.toLocation])).toEqual([
      ['60', 'GEN.A-01'],
      ['40', 'GEN.A-02'],
    ])
  })

  it('남은 수량보다 많이, 입고대기 창고로, 다른 센터 로케이션으로는 거부', async () => {
    await prepare('100')
    expect(await putaway(f.a01, '101')).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('적치할 수 있는 수량') },
    })
    expect(await putaway(f.icnStaging, '1')).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('보관 로케이션') },
    })
    expect(await putaway(f.b01, '1')).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('이 센터의 로케이션') },
    })
    expect(await qtyAt(f.icnStaging)).toBe('100')
    expect(await prisma.putaway.count()).toBe(0)
  })

  it('부분 확정분을 다 적치하면 부분적치, 잔량 마감하면 적치완료 (마감 후에도 적치 가능)', async () => {
    await prepare('70')
    expect(await putaway(f.a01, '70')).toMatchObject({
      ok: true,
      data: { putawayStatus: 'PARTIAL' },
    })
    ok(
      await closeAsnAction({
        id: asnId,
        rowVersion: await versionOf('asn', asnId),
        reasonCd: 'SHIPPER_CANCEL',
        reason: '잔량 취소',
      }),
    )
    expect((await prisma.asn.findFirstOrThrow()).putawayStatus).toBe('DONE')
  })

  it('적치 권한이 필요하다', async () => {
    await prepare('100')
    signInAs(ALL, ['inbound.putaway.read'])
    expect(await putaway(f.a01, '1')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
