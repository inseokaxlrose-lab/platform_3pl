import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { deleteInspection } from '@/lib/inbound/inspections'
import { parseLabelPayload } from './label-payload'
import { ensureLabels, markLabelsPrinted } from './labels'

// 관리 라벨 발행 (0054, 0003 결정 6)

let f: InboundFixture
let asnId = 0n
let lineId = 0n

const as = <T>(fn: () => Promise<T>) =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, fn)

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  const asn = await prisma.asn.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      centerId: f.icn,
      shipperId: f.gana,
      asnNo: 'AS-T-1',
      channel: 'PROXY',
      expectedOn: new Date('2026-11-20'),
      status: 'INSPECTING',
    },
  })
  asnId = asn.id
  lineId = (
    await prisma.asnLine.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        asnId,
        lineNo: 1,
        itemId: f.water,
        expectedQty: '3000',
      },
    })
  ).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

const inspection = (itemId: bigint, inspectedQty: string, defectQty = '0') =>
  prisma.inboundInspection.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      asnId,
      asnLineId: lineId,
      itemId,
      inspectedQty,
      defectQty,
    },
  })

describe('라벨 발행', () => {
  it('검수 3,000 EA, PLT = 1,440 EA → 3장 (1,440 / 1,440 / 120), 번호·글자·순번', async () => {
    const i = await inspection(f.water, '3000')
    const result = await as(() => ensureLabels(i.id))
    expect(result.created).toBe(3)
    const labels = await prisma.inboundLabel.findMany({ orderBy: { seq: 'asc' } })
    expect(labels.map((l) => [l.seq, l.total, l.labelUnit, l.qty.toString(), l.createdBy])).toEqual(
      [
        [1, 3, 'PLT', '1440', 'kim'],
        [2, 3, 'PLT', '1440', 'kim'],
        [3, 3, 'PLT', '120', 'kim'],
      ],
    )
    expect(labels[0].labelNo).toMatch(/^LB\d{6}-\d{5}$/)
    expect(parseLabelPayload(labels[2].payload)).toMatchObject({
      labelNo: labels[2].labelNo,
      centerCode: 'ICN',
      shipperCode: 'GANA',
      itemCode: 'WATER',
      qty: '120',
      unit: 'EA',
    })
    // 다시 불러도 새로 만들지 않는다 (번호 고정)
    expect(await as(() => ensureLabels(i.id))).toMatchObject({ created: 0 })
    expect(await prisma.inboundLabel.count()).toBe(3)
  })

  it('품목이 BOX 라벨이면 BOX 입수량으로, 라벨 단위 입수량이 없거나 불량뿐이면 거부', async () => {
    await prisma.item.update({ where: { id: f.water }, data: { labelUnit: 'BOX' } })
    const box = await inspection(f.water, '50')
    await as(() => ensureLabels(box.id))
    expect(
      (await prisma.inboundLabel.findMany({ orderBy: { seq: 'asc' } })).map((l) =>
        l.qty.toString(),
      ),
    ).toEqual(['24', '24', '2'])

    const rice = await inspection(f.rice, '10')
    await expect(as(() => ensureLabels(rice.id))).rejects.toThrow(
      '라벨 단위(PLT)의 입수량이 없습니다',
    )
    const defectOnly = await inspection(f.water, '0', '5')
    await expect(as(() => ensureLabels(defectOnly.id))).rejects.toThrow('정상 검수 수량이 없어')
  })

  it('인쇄할 때마다 횟수가 늘고, 인쇄한 검수는 지울 수 없다 (인쇄 전 라벨은 함께 지워진다)', async () => {
    const printed = await inspection(f.water, '100')
    const { ids } = await as(() => ensureLabels(printed.id))
    await as(() => markLabelsPrinted(ids))
    await as(() => markLabelsPrinted(ids))
    expect(await prisma.inboundLabel.findFirstOrThrow({ where: { id: ids[0] } })).toMatchObject({
      printCount: 2,
      lastPrintedBy: 'kim',
    })
    await expect(as(() => deleteInspection(printed.id))).rejects.toThrow('라벨을 인쇄한 검수')

    const fresh = await inspection(f.water, '100')
    await as(() => ensureLabels(fresh.id))
    await as(() => deleteInspection(fresh.id))
    expect(await prisma.inboundLabel.count({ where: { inspectionId: fresh.id } })).toBe(0)
  })
})
