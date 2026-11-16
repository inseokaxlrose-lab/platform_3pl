import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestCenter } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { DEFAULT_LOCATION_CODE, ensureCenterDefaults } from './center-defaults'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('센터 기본 구성 (대기 창고 3개 + 기본 로케이션)', () => {
  it('없으면 만들고, 여러 번 불러도 유형마다 하나만 있다. 센터의 기본 로케이션 3칸을 채운다', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    await ensureCenterDefaults(prisma, center.id)

    const warehouses = await prisma.warehouse.findMany({
      where: { centerId: center.id },
      include: { locations: true },
      orderBy: { type: 'asc' },
    })
    expect(warehouses.map((w) => [w.code, w.type])).toEqual([
      ['INBOUND', 'INBOUND_STAGING'],
      ['OUTBOUND', 'OUTBOUND_STAGING'],
      ['RETURN', 'RETURN_STAGING'],
    ])
    for (const w of warehouses) {
      expect(w.systemCode).toMatch(/^WH\d{6}$/)
      expect(w.locations.map((l) => [l.code, l.name])).toEqual([
        [DEFAULT_LOCATION_CODE, DEFAULT_LOCATION_CODE],
      ])
    }
    const saved = await prisma.center.findUniqueOrThrow({ where: { id: center.id } })
    expect([
      saved.defaultInboundLocId,
      saved.defaultOutboundLocId,
      saved.defaultReturnLocId,
    ]).toEqual(warehouses.map((w) => w.locations[0].id))
  })

  it('이미 고른 기본 로케이션은 바꾸지 않는다', async () => {
    const center = await createTestCenter('ICN')
    const inbound = await ensureCenterDefaults(prisma, center.id)
    const picked = await prisma.location.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        warehouseId: inbound.id,
        code: 'DOCK1',
        name: 'DOCK1',
      },
    })
    await prisma.center.update({
      where: { id: center.id },
      data: { defaultInboundLocId: picked.id },
    })
    await ensureCenterDefaults(prisma, center.id)
    const saved = await prisma.center.findUniqueOrThrow({ where: { id: center.id } })
    expect(saved.defaultInboundLocId).toBe(picked.id)
  })

  it('기본 로케이션만 빠져 있으면 채운다', async () => {
    const center = await createTestCenter('ICN')
    const warehouse = await ensureCenterDefaults(prisma, center.id)
    await prisma.center.update({
      where: { id: center.id },
      data: { defaultInboundLocId: null, defaultOutboundLocId: null, defaultReturnLocId: null },
    })
    await prisma.location.deleteMany({ where: { warehouseId: warehouse.id } })

    await ensureCenterDefaults(prisma, center.id)
    expect(await prisma.location.count({ where: { warehouseId: warehouse.id } })).toBe(1)
  })

  it('DB 규칙: 한 센터에 같은 유형의 대기 창고를 2개 만들 수 없다 (일반 창고는 여러 개 가능)', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    const make = (code: string, type: 'GENERAL' | 'INBOUND_STAGING' | 'RETURN_STAGING') =>
      prisma.warehouse.create({
        data: {
          operatorId: TEST_OPERATOR_ID,
          centerId: center.id,
          systemCode: `T-${code}`,
          code,
          name: code,
          type,
        },
      })

    await expect(make('INBOUND2', 'INBOUND_STAGING')).rejects.toMatchObject({ code: 'P2002' })
    await expect(make('RETURN2', 'RETURN_STAGING')).rejects.toMatchObject({ code: 'P2002' })
    await make('A', 'GENERAL')
    await make('B', 'GENERAL')
    expect(await prisma.warehouse.count({ where: { centerId: center.id } })).toBe(5)
  })

  it('창고가 있는 센터는 지울 수 없다 (이력 보호)', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    await expect(prisma.center.delete({ where: { id: center.id } })).rejects.toBeTruthy()
  })
})
