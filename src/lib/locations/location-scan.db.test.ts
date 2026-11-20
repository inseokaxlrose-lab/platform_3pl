import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { prisma } from '@/lib/prisma'
import { createTestCenter } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import { parseLocationScan } from './location-scan'

// 로케이션 스캔 해석 (0084 ⑤): 창고코드.로케이션코드면 한 곳, 코드만이면 1건 확정·여러 건은 후보

let icn = 0n
let gmh = 0n

beforeEach(async () => {
  await resetDatabase()
  icn = (await createTestCenter('ICN')).id
  gmh = (await createTestCenter('GMH')).id
  // 입고·출고·반품 대기 창고마다 DEFAULT 로케이션 (같은 센터에 같은 코드가 3개)
  await ensureCenterDefaults(prisma, icn)
  await ensureCenterDefaults(prisma, gmh)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('parseLocationScan', () => {
  it('창고코드.로케이션코드는 그 센터의 한 곳, 다른 센터·없는 코드는 못 찾음', async () => {
    const found = await parseLocationScan(prisma, icn, 'inbound.default')
    expect(found).toMatchObject({
      result: 'FOUND',
      location: { code: 'DEFAULT', warehouseCode: 'INBOUND', barcode: 'INBOUND.DEFAULT' },
    })
    // 같은 바코드라도 센터가 다르면 다른 로케이션
    const other = await parseLocationScan(prisma, gmh, 'INBOUND.DEFAULT')
    expect(other.result === 'FOUND' && found.result === 'FOUND' && other.location.id).not.toBe(
      found.result === 'FOUND' && found.location.id,
    )
    expect(await parseLocationScan(prisma, icn, 'INBOUND.NOPE')).toEqual({ result: 'NOT_FOUND' })
    expect(await parseLocationScan(prisma, icn, 'A.B.C')).toEqual({ result: 'NOT_FOUND' })
  })

  it('로케이션코드만 치면 센터 안에서 찾아 1건은 확정, 여러 건은 창고를 고르게 후보', async () => {
    const ambiguous = await parseLocationScan(prisma, icn, 'default')
    expect(ambiguous.result).toBe('AMBIGUOUS')
    expect(ambiguous.result === 'AMBIGUOUS' && ambiguous.candidates.map((c) => c.barcode)).toEqual([
      'INBOUND.DEFAULT',
      'OUTBOUND.DEFAULT',
      'RETURN.DEFAULT',
    ])
    // 한 창고에만 있는 코드
    const inbound = await prisma.warehouse.findFirstOrThrow({
      where: { centerId: icn, code: 'INBOUND' },
    })
    await prisma.location.create({
      data: {
        operatorId: inbound.operatorId,
        centerId: icn,
        warehouseId: inbound.id,
        code: 'A-01-01',
      },
    })
    expect(await parseLocationScan(prisma, icn, 'A-01-01')).toMatchObject({
      result: 'FOUND',
      location: { barcode: 'INBOUND.A-01-01' },
    })
  })
})
