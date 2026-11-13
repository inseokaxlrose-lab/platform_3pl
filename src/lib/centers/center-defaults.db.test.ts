import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestCenter } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import { DEFAULT_LOCATION_CODE, ensureCenterDefaults } from './center-defaults'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('센터 기본 구성 (입고대기 창고 + 기본 로케이션)', () => {
  it('없으면 만들고, 여러 번 불러도 하나만 있다', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    await ensureCenterDefaults(prisma, center.id)

    const warehouses = await prisma.warehouse.findMany({
      where: { centerId: center.id },
      include: { locations: true },
    })
    expect(warehouses).toHaveLength(1)
    expect(warehouses[0]).toMatchObject({ code: 'INBOUND', type: 'INBOUND_STAGING' })
    expect(warehouses[0].systemCode).toMatch(/^WH\d{6}$/)
    expect(warehouses[0].locations.map((l) => l.code)).toEqual([DEFAULT_LOCATION_CODE])
  })

  it('기본 로케이션만 빠져 있으면 채운다', async () => {
    const center = await createTestCenter('ICN')
    const warehouse = await ensureCenterDefaults(prisma, center.id)
    await prisma.location.deleteMany({ where: { warehouseId: warehouse.id } })

    await ensureCenterDefaults(prisma, center.id)
    expect(await prisma.location.count({ where: { warehouseId: warehouse.id } })).toBe(1)
  })

  it('DB 규칙: 한 센터에 입고대기 창고를 2개 만들 수 없다 (일반 창고는 여러 개 가능)', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    const make = (code: string, type: 'GENERAL' | 'INBOUND_STAGING') =>
      prisma.warehouse.create({
        data: { centerId: center.id, systemCode: `T-${code}`, code, name: code, type },
      })

    await expect(make('INBOUND2', 'INBOUND_STAGING')).rejects.toMatchObject({ code: 'P2002' })
    await make('A', 'GENERAL')
    await make('B', 'GENERAL')
    expect(await prisma.warehouse.count({ where: { centerId: center.id } })).toBe(3)
  })

  it('창고가 있는 센터는 지울 수 없다 (이력 보호)', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    await expect(prisma.center.delete({ where: { id: center.id } })).rejects.toBeTruthy()
  })
})
