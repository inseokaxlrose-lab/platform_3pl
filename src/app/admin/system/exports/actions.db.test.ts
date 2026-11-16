import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { kstToday } from '@/lib/stock/expiry'
import { adjustStock, moveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { createAsnAction } from '../../inbound/asn/actions'
import { confirmReceiptAction } from '../../inbound/confirm/actions'
import { addInspectionAction } from '../../inbound/inspection/actions'
import { buildReportAction } from './actions'

// 정산·보고용 자료 추출 (docs/decisions/0064)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture
const today = kstToday()
const tomorrow = (() => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
})()

function ok<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signInAs(ALL)
  // 오늘: 생수 ASN 1,000 → 검수 1,000 → 확정 1,000 (입고대기) → A-01로 600 이동 → A-01 −10 조정
  const asn = ok(
    await createAsnAction({
      shipperId: String(f.gana),
      centerId: String(f.icn),
      expectedOn: today,
      shipperRefNo: 'PO-9',
      remark: '',
      lines: [
        { itemId: String(f.water), unit: 'EA', qty: '1000', lotNo: '', expiryOn: '', remark: '' },
      ],
    }),
  )
  const line = await prisma.asnLine.findFirstOrThrow()
  const inspection = ok(
    await addInspectionAction({
      asnLineId: String(line.id),
      unit: 'EA',
      qty: '1000',
      defectQty: '',
      lotNo: '',
      expiryOn: '',
      remark: '',
    }),
  )
  ok(
    await confirmReceiptAction({
      asnId: asn.id,
      lines: [{ inspectionId: String(inspection.id), qty: '1000' }],
      remark: '',
    }),
  )
  await runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
    stockTransaction(async (tx) => {
      await moveStock(tx, {
        from: { locationId: f.icnStaging, itemId: f.water },
        toLocationId: f.a01,
        qty: '600',
      })
      await adjustStock(tx, {
        address: { locationId: f.a01, itemId: f.water },
        qty: '-10',
        reason: '파손',
      })
    }),
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})

const build = (type: 'RECEIPTS' | 'MOVEMENT' | 'STOCK', from = today, to = today) =>
  buildReportAction({ type, from, to, centerId: '', shipperId: '' })

describe('자료 추출', () => {
  it('입고 실적: 기간 안 확정 줄, 수량은 숫자', async () => {
    const report = ok(await build('RECEIPTS'))
    expect(report.fileName).toBe(`입고 실적_${today}~${today}.xlsx`)
    expect(report.sheet.rows).toHaveLength(1)
    const row = report.sheet.rows[0]
    expect(row[report.sheet.header.indexOf('화주사 문서 번호')]).toBe('PO-9')
    expect(row[report.sheet.header.indexOf('확정 수량')]).toBe(1000)
    expect(ok(await build('RECEIPTS', tomorrow, tomorrow)).sheet.rows).toEqual([])
  })

  it('기간 재고 수불: 기초 + 입고 + 조정 = 기말 (이동은 합계에 영향 없음), 다음 날 기초 = 오늘 기말', async () => {
    const todayReport = ok(await build('MOVEMENT'))
    expect(todayReport.sheet.rows.map((r) => r.slice(2))).toEqual([
      ['WATER', 'WATER', 'EA', 0, 1000, 0, -10, 990],
    ])
    const next = ok(await build('MOVEMENT', tomorrow, tomorrow))
    expect(next.sheet.rows.map((r) => r.slice(5))).toEqual([[990, 0, 0, 0, 990]])
  })

  it('현재 재고: 로케이션별 수량', async () => {
    const report = ok(await build('STOCK', '', ''))
    const qtyAt = Object.fromEntries(
      report.sheet.rows.map((r) => [r[2], r[report.sheet.header.indexOf('재고')]]),
    )
    expect(qtyAt).toEqual({ DEFAULT: 400, 'A-01': 590 })
  })

  it('기간 필수·1년까지, 엑셀 권한, 범위', async () => {
    expect(
      await buildReportAction({ type: 'MOVEMENT', from: '', to: '', centerId: '', shipperId: '' }),
    ).toMatchObject({ ok: false })
    expect(await build('RECEIPTS', '2025-01-01', '2026-06-01')).toMatchObject({ ok: false })
    signInAs(ALL, ['system.exports.read'])
    expect(await build('STOCK')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    signInAs({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect(ok(await build('MOVEMENT')).sheet.rows).toEqual([])
  })
})
