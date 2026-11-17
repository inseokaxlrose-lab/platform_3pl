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

describe('센터 기본 구성 (시스템 기본 창고 3개 + 기본 로케이션)', () => {
  it('없으면 만들고, 여러 번 불러도 유형마다 하나만 있다. 센터·창고의 기본 로케이션을 채운다', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    await ensureCenterDefaults(prisma, center.id)

    const warehouses = await prisma.warehouse.findMany({
      where: { centerId: center.id },
      include: { locations: true },
      orderBy: { sortOrder: 'asc' },
    })
    // 유형·시스템 기본 여부·정렬순서·운영 속성(유형 기본값)
    expect(
      warehouses.map((w) => [
        w.code,
        w.type,
        w.systemYn,
        w.sortOrder,
        `${w.inboundYn}${w.outboundYn}${w.allocatableYn}`,
        w.defaultStockStatus,
      ]),
    ).toEqual([
      ['INBOUND', 'INBOUND', 'Y', 1, 'YNN', 'NORMAL'],
      ['OUTBOUND', 'OUTBOUND', 'Y', 2, 'NYN', 'NORMAL'],
      ['RETURN', 'RETURN', 'Y', 3, 'YNN', 'HOLD'],
    ])
    for (const w of warehouses) {
      expect(w.systemCode).toMatch(/^WH\d{6}$/)
      expect(w.locations.map((l) => [l.code, l.name])).toEqual([
        [DEFAULT_LOCATION_CODE, DEFAULT_LOCATION_CODE],
      ])
      // 창고의 기본 로케이션 = DEFAULT
      expect(w.defaultLocId).toBe(w.locations[0].id)
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
    await prisma.warehouse.update({ where: { id: warehouse.id }, data: { defaultLocId: null } })
    await prisma.location.deleteMany({ where: { warehouseId: warehouse.id } })

    await ensureCenterDefaults(prisma, center.id)
    expect(await prisma.location.count({ where: { warehouseId: warehouse.id } })).toBe(1)
    const saved = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } })
    expect(saved.defaultLocId).not.toBeNull()
  })

  it('기본 창고 온도대: 센터 취급 온도대 중 상온, 없으면 첫 번째. 하나도 없으면 상온을 센터에도 넣는다', async () => {
    const frozen = await createTestCenter('FRZ')
    await prisma.centerTempZone.create({ data: { centerId: frozen.id, tempZoneCd: 'FROZEN' } })
    await ensureCenterDefaults(prisma, frozen.id)
    const zonesOf = async (centerId: bigint) =>
      (await prisma.warehouse.findMany({ where: { centerId }, select: { tempZone: true } })).map(
        (w) => w.tempZone,
      )
    expect(await zonesOf(frozen.id)).toEqual(['FROZEN', 'FROZEN', 'FROZEN'])

    const empty = await createTestCenter('EMP')
    await ensureCenterDefaults(prisma, empty.id)
    expect(await zonesOf(empty.id)).toEqual(['AMBIENT', 'AMBIENT', 'AMBIENT'])
    const centerZones = await prisma.centerTempZone.findMany({ where: { centerId: empty.id } })
    expect(centerZones.map((z) => z.tempZoneCd)).toEqual(['AMBIENT'])
  })

  it('DB 규칙: 한 센터에 같은 유형의 시스템 기본 창고는 1개, 시스템 기본 창고는 대기 유형·사용 중만', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    const make = (code: string, type: string, systemYn: string, status = 'ACTIVE') =>
      prisma.warehouse.create({
        data: {
          operatorId: TEST_OPERATOR_ID,
          centerId: center.id,
          systemCode: `T-${code}`,
          code,
          name: code,
          type,
          tempZone: 'AMBIENT',
          systemYn,
          status,
        },
      })

    await expect(make('INBOUND2', 'INBOUND', 'Y')).rejects.toMatchObject({ code: 'P2002' })
    await expect(make('RETURN2', 'RETURN', 'Y')).rejects.toMatchObject({ code: 'P2002' })
    await expect(make('QC1', 'QC', 'Y')).rejects.toThrow(/tb_warehouse_system_check/)
    // 사용자가 만드는 창고는 대기 유형이어도 여러 개 가능
    await make('IN_EXTRA', 'INBOUND', 'N')
    await make('A', 'STORAGE', 'N')
    await expect(make('BAD', 'GENERAL', 'N')).rejects.toThrow(/tb_warehouse_type_check/)
    expect(await prisma.warehouse.count({ where: { centerId: center.id } })).toBe(5)
    // 시스템 기본 창고는 사용 중지할 수 없다 (DB 검사 조건)
    const inbound = await prisma.warehouse.findFirstOrThrow({
      where: { centerId: center.id, type: 'INBOUND', systemYn: 'Y' },
    })
    await expect(
      prisma.warehouse.update({ where: { id: inbound.id }, data: { status: 'INACTIVE' } }),
    ).rejects.toThrow(/tb_warehouse_system_check/)
  })

  it('창고가 있는 센터는 지울 수 없다 (이력 보호)', async () => {
    const center = await createTestCenter('ICN')
    await ensureCenterDefaults(prisma, center.id)
    await expect(prisma.center.delete({ where: { id: center.id } })).rejects.toBeTruthy()
  })
})
