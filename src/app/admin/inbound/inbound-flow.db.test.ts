import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { getAsnForEdit } from '@/lib/inbound/asn-queries'
import { parseLabelPayload } from '@/lib/labels/label-payload'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { parseQty, qtyText } from '@/lib/units/convert'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { createPortalAsnAction, listPortalAsnsAction } from '../../portal/asn/actions'
import { listAsnsAction } from './asn/actions'
import { confirmReceiptAction } from './confirm/actions'
import { addInspectionAction } from './inspection/actions'
import { markLabelsPrintedAction, prepareLabelsAction } from './labels/actions'
import { registerPutawayAction } from './putaway/actions'

// 입고 흐름 통합 테스트 (ROADMAP M5 마지막, docs/decisions/0059)
// 화주사가 포털에서 ASN 등록 → 센터 작업자 검수(로트 2개)·라벨 → 부분 확정 → 적치
// → 나머지 검수(초과)·확정 → 확정완료 → 나머지 적치 → 적치완료. 화주사는 포털에서 진행을 본다
// 끝에서 재고 수량 = 확정 합계, 입고대기 창고는 0, 재고 이력 합계 = 재고 수량을 확인한다

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

let f: InboundFixture
let shipperScope: DataScope
let centerScope: DataScope

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  shipperScope = { kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.gana }
  centerScope = { kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.icn] }
})

afterAll(async () => {
  await prisma.$disconnect()
})

function ok<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const asShipper = () =>
  signInAs(shipperScope, ['portal.asn.read', 'portal.asn.create', 'portal.asn.update'], 'gana.user')
const asWorker = () =>
  signInAs(
    centerScope,
    [
      'inbound.asn.read',
      'inbound.inspection.read',
      'inbound.inspection.update',
      'inbound.labels.read',
      'inbound.labels.print',
      'inbound.confirm.read',
      'inbound.confirm.confirm',
      'inbound.putaway.read',
      'inbound.putaway.confirm',
    ],
    'icn.worker',
  )

describe('입고 한 바퀴', () => {
  it('ASN 등록 → 검수·라벨 → 부분 확정 → 적치 → 초과 확정 → 확정완료 → 적치완료', async () => {
    // ① 화주사: 포털에서 ASN 등록 (생수 PLT 2 = 2,880 EA, 우유 50 EA)
    asShipper()
    const asn = ok(
      await createPortalAsnAction({
        centerId: String(f.icn),
        expectedOn: '2026-11-20',
        shipperRefNo: 'PO-777',
        remark: '',
        lines: [
          { itemId: String(f.water), unit: 'PLT', qty: '2', lotNo: '', expiryOn: '', remark: '' },
          { itemId: String(f.milk), unit: 'EA', qty: '50', lotNo: '', expiryOn: '', remark: '' },
        ],
      }),
    )
    const lines = await prisma.asnLine.findMany({
      where: { asnId: BigInt(asn.id) },
      orderBy: { lineNo: 'asc' },
    })
    expect(lines.map((l) => l.expectedQty.toString())).toEqual(['2880', '50'])

    // ② 센터 작업자: 검수 — 생수 2,000 EA(불량 10), 우유 로트 2개 (30 + 20)
    asWorker()
    const inspect = async (lineIndex: number, qty: string, extra = {}) =>
      String(
        ok(
          await addInspectionAction({
            asnLineId: String(lines[lineIndex].id),
            unit: 'EA',
            qty,
            defectQty: '',
            lotNo: '',
            expiryOn: '',
            remark: '',
            ...extra,
          }),
        ).id,
      )
    const water1 = await inspect(0, '2000', { defectQty: '10' })
    const milkA = await inspect(1, '30', { lotNo: 'MA', expiryOn: '2027-01-31' })
    const milkB = await inspect(1, '20', { lotNo: 'MB', expiryOn: '2027-02-28' })
    expect((await prisma.asn.findFirstOrThrow()).status).toBe('INSPECTING')

    // ③ 라벨: 생수 2,000 / PLT 1,440 → 2장 (1,440 / 560), 우유는 PLT 입수량이 없어 거부
    const labels = ok(await prepareLabelsAction({ inspectionIds: [water1] }))
    expect(labels.map((l) => l.qty)).toEqual(['1440', '560'])
    expect(parseLabelPayload(labels[1].payload)).toMatchObject({
      itemCode: 'WATER',
      qty: '560',
      centerCode: 'ICN',
    })
    ok(await markLabelsPrintedAction({ labelIds: labels.map((l) => l.id) }))
    expect(await prepareLabelsAction({ inspectionIds: [milkA] })).toMatchObject({ ok: false })

    // ④ 부분 확정: 생수 1,500 + 우유 두 로트 전부 → 부분확정
    const receipt1 = ok(
      await confirmReceiptAction({
        asnId: asn.id,
        lines: [
          { inspectionId: water1, qty: '1500' },
          { inspectionId: milkA, qty: '30' },
          { inspectionId: milkB, qty: '20' },
        ],
        remark: '',
      }),
    )
    expect(receipt1.status).toBe('PARTIAL')

    // ⑤ 적치: 생수 1,500 → A-01 1,000 + A-02 500, 우유 두 로트 → A-02
    const receiptLines = await prisma.inboundReceiptLine.findMany({ orderBy: { id: 'asc' } })
    const put = (index: number, location: bigint, qty: string) => ({
      receiptLineId: String(receiptLines[index].id),
      toLocationId: String(location),
      qty,
    })
    expect(
      ok(
        await registerPutawayAction({
          asnId: asn.id,
          lines: [
            put(0, f.a01, '1000'),
            put(0, f.a02, '500'),
            put(1, f.a02, '30'),
            put(2, f.a02, '20'),
          ],
        }),
      ),
    ).toMatchObject({ count: 4, putawayStatus: 'PARTIAL' })

    // ⑥ 나머지 생수 도착: 검수 1,000 (예정 2,880 → 누적 확정 3,000 = 초과 120), 앞 검수의 남은 500도 함께 확정
    const water2 = await inspect(0, '1000')
    const receipt2 = ok(
      await confirmReceiptAction({
        asnId: asn.id,
        lines: [
          { inspectionId: water1, qty: '500' },
          { inspectionId: water2, qty: '1000' },
        ],
        remark: '나머지 도착',
      }),
    )
    expect(receipt2.status).toBe('COMPLETED')

    // ⑦ 나머지 적치 → 적치완료
    const rest = await prisma.inboundReceiptLine.findMany({
      where: { receiptId: BigInt(receipt2.id) },
      orderBy: { id: 'asc' },
    })
    expect(
      ok(
        await registerPutawayAction({
          asnId: asn.id,
          lines: rest.map((line) => ({
            receiptLineId: String(line.id),
            toLocationId: String(f.a01),
            qty: line.qty.toString(),
          })),
        }),
      ),
    ).toMatchObject({ putawayStatus: 'DONE' })

    // ── 결과 확인 ──
    // 재고: 입고대기 0, A-01 생수 2,500, A-02 생수 500 + 우유 로트별
    const stocks = await prisma.stock.findMany({
      include: { location: { select: { code: true } }, item: { select: { code: true } } },
      orderBy: [{ locationId: 'asc' }, { itemId: 'asc' }, { lotNo: 'asc' }],
    })
    const where = Object.fromEntries(
      stocks.map((s) => [`${s.location.code}:${s.item.code}:${s.lotNo ?? ''}`, s.qty.toString()]),
    )
    expect(where).toEqual({
      'DEFAULT:WATER:': '0',
      'DEFAULT:MILK:MA': '0',
      'DEFAULT:MILK:MB': '0',
      'A-01:WATER:': '2500',
      'A-02:WATER:': '500',
      'A-02:MILK:MA': '30',
      'A-02:MILK:MB': '20',
    })
    // 품목별 재고 합계 = 확정 합계 (불량 10은 재고가 아님)
    const total = (code: string) =>
      qtyText(
        stocks
          .filter((s) => s.item.code === code)
          .reduce((sum, s) => sum + parseQty(s.qty.toString()), 0n),
      )
    expect([total('WATER'), total('MILK')]).toEqual(['3000', '50'])
    // 재고 줄마다 이력 합계 = 수량, 음수 없음
    const sums = await prisma.stockTxn.groupBy({ by: ['stockId'], _sum: { qtyChange: true } })
    for (const s of stocks) {
      expect(sums.find((x) => x.stockId === s.id)?._sum.qtyChange?.toString() ?? '0').toBe(
        s.qty.toString(),
      )
      expect(parseQty(s.qty.toString()) >= 0n).toBe(true)
    }

    // ASN 진행: 생수 초과 120, 잔량 0 / 상태 확정완료·적치완료
    const edit = await getAsnForEdit(BigInt(asn.id), centerScope)
    expect(edit).toMatchObject({ status: 'COMPLETED', putawayStatus: 'DONE', channel: 'PORTAL' })
    expect(
      edit?.progress.map((p) => [
        p.expectedQty,
        p.confirmedQty,
        p.remainingQty,
        p.overQty,
        p.putawayQty,
      ]),
    ).toEqual([
      ['2880', '3000', '0', '120', '3000'],
      ['50', '50', '0', '0', '50'],
    ])
    const adminList = ok(await listAsnsAction({ ...createDataGridState(), filters: {} }))
    expect(adminList.rows[0]).toMatchObject({ remainingLines: 0, overLines: 1 })

    // 화주사: 포털에서 자기 ASN의 진행을 본다
    asShipper()
    const portal = ok(await listPortalAsnsAction({ ...createDataGridState(), filters: {} }))
    expect(portal.rows.map((r) => [r.asnNo, r.status, r.putawayStatus])).toEqual([
      [asn.asnNo, 'COMPLETED', 'DONE'],
    ])
  })
})
