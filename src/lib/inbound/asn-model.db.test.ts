import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { nextDocumentNumber } from '@/lib/documents/doc-no'
import { prisma } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'

// ASN · 입고확정 DB 규칙 (docs/decisions/0047) — 업무 함수가 실수해도 DB가 마지막에 막는다

let base: { centerId: bigint; shipperId: bigint; itemId: bigint }

beforeEach(async () => {
  await resetDatabase()
  const center = await createTestCenter('ICN')
  const shipper = await createTestShipper('GANA')
  const unit = await prisma.unit.create({
    data: { operatorId: TEST_OPERATOR_ID, code: 'EA', name: '개', kind: 'BASE' },
  })
  const item = await prisma.item.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      shipperId: shipper.id,
      systemCode: 'IT-T-1',
      code: 'WATER',
      name: '생수',
      baseUnitId: unit.id,
    },
  })
  base = { centerId: center.id, shipperId: shipper.id, itemId: item.id }
})

afterAll(async () => {
  await prisma.$disconnect()
})

const asn = (data: Record<string, unknown> = {}) =>
  prisma.asn.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      centerId: base.centerId,
      shipperId: base.shipperId,
      asnNo: `AS-T-${Math.random().toString(36).slice(2, 10)}`,
      channel: 'PROXY',
      expectedOn: new Date('2026-11-20'),
      ...data,
    },
  })

const line = (asnId: bigint, data: Record<string, unknown> = {}) =>
  prisma.asnLine.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      asnId,
      lineNo: 1,
      itemId: base.itemId,
      expectedQty: '100',
      ...data,
    },
  })

describe('ASN 번호', () => {
  it('AS + 한국 날짜 + 일련번호, 동시에 받아도 겹치지 않는다', async () => {
    const numbers = await Promise.all(Array.from({ length: 10 }, () => nextDocumentNumber('ASN')))
    expect(new Set(numbers).size).toBe(10)
    for (const n of numbers) expect(n).toMatch(/^AS\d{6}-\d{5,}$/)
    expect(await nextDocumentNumber('RECEIPT')).toMatch(/^RC\d{6}-\d{5,}$/)
  })

  it('ASN 번호는 하나뿐', async () => {
    await asn({ asnNo: 'AS261116-00001' })
    await expect(asn({ asnNo: 'AS261116-00001' })).rejects.toThrow()
  })
})

describe('ASN 규칙', () => {
  it('기본 상태: 예정·적치대기·화주사입고, 운영사 출입증 안에서는 운영사·등록자 자동', async () => {
    const created = await runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
      prisma.asn.create({
        data: {
          centerId: base.centerId,
          shipperId: base.shipperId,
          asnNo: 'AS261116-00002',
          channel: 'PORTAL',
          expectedOn: new Date('2026-11-20'),
        },
      }),
    )
    expect(created).toMatchObject({
      operatorId: TEST_OPERATOR_ID,
      status: 'PLANNED',
      putawayStatus: 'WAITING',
      type: 'SHIPPER',
      createdBy: 'kim',
      delYn: 'N',
    })
  })

  it('마감 상태는 사유·마감자·일시가 필요하다', async () => {
    await expect(asn({ status: 'CLOSED' })).rejects.toThrow()
    await expect(
      asn({ status: 'CLOSED', closeReason: ' ', closedAt: new Date(), closedBy: 'kim' }),
    ).rejects.toThrow()
    const closed = await asn({
      status: 'CLOSED',
      closeReason: '화주사 요청으로 잔량 취소',
      closedAt: new Date(),
      closedBy: 'kim',
    })
    expect(closed.status).toBe('CLOSED')
  })

  it('라인: 예정 > 0, 적치 ≤ 확정, 누적은 0 이상, 라인 번호는 ASN 안에서 하나', async () => {
    const a = await asn()
    await expect(line(a.id, { expectedQty: '0' })).rejects.toThrow()
    await expect(line(a.id, { confirmedQty: '5', putawayQty: '6' })).rejects.toThrow()
    await expect(line(a.id, { closedQty: '-1' })).rejects.toThrow()
    await expect(line(a.id, { lotNo: '' })).rejects.toThrow()
    await expect(line(a.id, { lineNo: 0 })).rejects.toThrow()
    // 초과 확정은 된다 (예정 100, 확정 120)
    await line(a.id, { confirmedQty: '120', putawayQty: '120' })
    await expect(line(a.id)).rejects.toThrow()
  })
})
