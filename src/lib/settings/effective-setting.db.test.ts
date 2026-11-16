import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { getEffectiveSetting, resolveInherited } from './effective-setting'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('resolveInherited (아래 단계부터 처음 정해진 값)', () => {
  it('화주사 → 센터 → 운영사', () => {
    expect(resolveInherited({ shipper: 'A', center: 'B', operator: 'C' })).toEqual({
      value: 'A',
      source: 'SHIPPER',
    })
    expect(resolveInherited({ shipper: null, center: 'B', operator: 'C' })).toEqual({
      value: 'B',
      source: 'CENTER',
    })
    expect(resolveInherited({ center: null, operator: 'C' })).toEqual({
      value: 'C',
      source: 'OPERATOR',
    })
    // false도 "정한 값"이다 (비어 있는 것과 다르다)
    expect(resolveInherited({ center: false, operator: true })).toEqual({
      value: false,
      source: 'CENTER',
    })
  })
})

describe('getEffectiveSetting (센터·화주사에 적용되는 실제 설정)', () => {
  it('출고 마감: 센터가 비면 운영사 값, 센터가 정하면 센터 값', async () => {
    await prisma.operator.update({
      where: { id: TEST_OPERATOR_ID },
      data: { shipCutoffTime: new Date('1970-01-01T17:00:00Z') },
    })
    const center = await createTestCenter('ICN')
    const target = { centerId: center.id }
    expect(await getEffectiveSetting('shipCutoffTime', target)).toEqual({
      value: '17:00',
      source: 'OPERATOR',
    })
    await prisma.center.update({
      where: { id: center.id },
      data: { shipCutoffTime: new Date('1970-01-01T15:30:00Z') },
    })
    expect(await getEffectiveSetting('shipCutoffTime', target)).toEqual({
      value: '15:30',
      source: 'CENTER',
    })
  })

  it('할당 규칙·타임존은 화주사 단계 없이 센터 → 운영사', async () => {
    const center = await createTestCenter('ICN')
    expect(await getEffectiveSetting('allocRule', { centerId: center.id })).toEqual({
      value: 'FIFO',
      source: 'OPERATOR',
    })
    await prisma.center.update({ where: { id: center.id }, data: { allocRule: 'FEFO' } })
    expect(await getEffectiveSetting('allocRule', { centerId: center.id })).toEqual({
      value: 'FEFO',
      source: 'CENTER',
    })
    expect(await getEffectiveSetting('timezone', { centerId: center.id })).toEqual({
      value: 'Asia/Seoul',
      source: 'OPERATOR',
    })
  })

  it('로트 관리: 화주사 값이 센터·운영사보다 먼저, 예/아니오는 boolean', async () => {
    const center = await createTestCenter('ICN')
    const shipper = await createTestShipper('GANA')
    await prisma.center.update({ where: { id: center.id }, data: { useLot: 'N' } })
    expect(await getEffectiveSetting('useLot', { centerId: center.id })).toEqual({
      value: false,
      source: 'CENTER',
    })
    await prisma.shipper.update({ where: { id: shipper.id }, data: { useLot: 'Y' } })
    expect(
      await getEffectiveSetting('useLot', { centerId: center.id, shipperId: shipper.id }),
    ).toEqual({ value: true, source: 'SHIPPER' })
  })
})
