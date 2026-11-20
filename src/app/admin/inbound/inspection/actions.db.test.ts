import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { getInspectionWork } from '@/lib/inbound/inspection-queries'
import type { InspectionInput } from '@/lib/inbound/inspection-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { createAsnAction } from '../asn/actions'
import { addInspectionAction, deleteInspectionAction, listInspectionAsnsAction } from './actions'

// 입고 검수 (docs/decisions/0053)

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
      {
        itemId: String(f.milk),
        unit: 'EA',
        qty: '50',
        lotNo: 'L1',
        expiryOn: '2027-01-31',
        remark: '',
      },
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

const inspect = (overrides: Partial<InspectionInput>) =>
  addInspectionAction({
    asnLineId: lines.water,
    unit: 'EA',
    qty: '10',
    defectQty: '',
    lotNo: '',
    expiryOn: '',
    remark: '',
    ...overrides,
  })

describe('검수 등록', () => {
  it('단위 환산(BOX 2 = 48 EA)·불량·검수자, 첫 검수에 ASN은 검수중', async () => {
    // 불량이 있으면 불량 사유 필수 (0087)
    expect(await inspect({ unit: 'BOX', qty: '2', defectQty: '1' })).toMatchObject({
      ok: false,
      error: { fieldErrors: { defectReasonCd: ['불량 사유를 골라 주세요.'] } },
    })
    expect(
      await inspect({ unit: 'BOX', qty: '2', defectQty: '1', defectReasonCd: 'NO_SUCH' }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('불량 사유') } })
    expect(
      await inspect({ unit: 'BOX', qty: '2', defectQty: '1', defectReasonCd: 'PRODUCT_DAMAGE' }),
    ).toMatchObject({ ok: true })
    const saved = await prisma.inboundInspection.findFirstOrThrow()
    expect(saved.defectReasonCd).toBe('PRODUCT_DAMAGE')
    expect([
      saved.inspectedQty.toString(),
      saved.defectQty.toString(),
      saved.entryUnit,
      saved.entryQty?.toString(),
      saved.inspectedBy,
    ]).toEqual(['48', '24', 'BOX', '2', 'kim'])
    expect((await prisma.asn.findFirstOrThrow()).status).toBe('INSPECTING')

    // 작업 화면: 품목별 검수·불량 합계
    const work = await getInspectionWork(BigInt(asnId), ALL)
    expect(work?.lines[0]).toMatchObject({
      inspectedQty: '48',
      defectQty: '24',
      remainingQty: '100',
    })
    expect(work?.inspections).toHaveLength(1)
    expect(work?.inspections[0]).toMatchObject({ defectReasonCd: 'PRODUCT_DAMAGE' })
  })

  it('로트·유통기한: 관리 품목은 필수, 관리하지 않는 품목은 거부. 수량은 둘 중 하나 이상', async () => {
    expect(await inspect({ asnLineId: lines.milk })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('로트번호를 넣어') },
    })
    expect(await inspect({ asnLineId: lines.milk, lotNo: 'L1' })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('유통기한을 넣어') },
    })
    expect(
      await inspect({ asnLineId: lines.milk, lotNo: 'L1', expiryOn: '2027-01-31' }),
    ).toMatchObject({ ok: true })
    expect(await inspect({ lotNo: 'X' })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('로트를 관리하지 않는') },
    })
    expect(await inspect({ qty: '', defectQty: '' })).toMatchObject({ ok: false })
    expect(await inspect({ qty: '1.5' })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('정수만') },
    })
    // 불량만 있는 검수도 된다
    expect(await inspect({ qty: '0', defectQty: '3', defectReasonCd: 'ETC' })).toMatchObject({
      ok: true,
    })
  })

  it('마감된 ASN은 검수할 수 없다, 범위 밖이면 찾을 수 없다', async () => {
    signInAs({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect(await inspect({})).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    signInAs(ALL)
    await prisma.asn.update({
      where: { id: BigInt(asnId) },
      data: { status: 'CLOSED', closeReason: '취소', closedAt: new Date(), closedBy: 'kim' },
    })
    expect(await inspect({})).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('마감된 ASN') },
    })
  })
})

describe('검수 지우기 · ASN 고르기', () => {
  it('확정 전 검수만 지운다, 다 지우면 ASN은 다시 예정', async () => {
    await inspect({})
    const record = await prisma.inboundInspection.findFirstOrThrow()
    await prisma.inboundInspection.update({ where: { id: record.id }, data: { confirmedQty: '5' } })
    expect(await deleteInspectionAction({ id: String(record.id) })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('입고 확정한 검수') },
    })
    await prisma.inboundInspection.update({ where: { id: record.id }, data: { confirmedQty: '0' } })
    expect(await deleteInspectionAction({ id: String(record.id) })).toMatchObject({ ok: true })
    expect((await prisma.asn.findFirstOrThrow()).status).toBe('PLANNED')
  })

  it('검수 목록은 기본으로 진행 중인 ASN만', async () => {
    await prisma.asn.update({ where: { id: BigInt(asnId) }, data: { status: 'COMPLETED' } })
    const open = await listInspectionAsnsAction({ ...createDataGridState(), filters: {} })
    expect(open.ok && open.data.rows).toEqual([])
    const all = await listInspectionAsnsAction({
      ...createDataGridState(),
      filters: { status: 'COMPLETED' },
    })
    expect(all.ok && all.data.rows).toHaveLength(1)
  })
})
