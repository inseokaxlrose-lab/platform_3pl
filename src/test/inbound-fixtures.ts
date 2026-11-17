import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { prisma } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from './factories'
import { TEST_OPERATOR_ID } from './reset-database'

// 입고 테스트 공통 준비 데이터 (resetDatabase 다음에 부른다)
// 이천센터(ICN)·김해센터(GMH) (각각 입고대기 창고) / 화주사 가나(이천 이용)·다라(김해 이용)
// 가나 품목: WATER(EA 정수, BOX 24) · MILK(로트·유통기한 관리) · RICE(KG 소수 3자리) / 다라 품목: DARA1
export async function createInboundFixture() {
  const icn = await createTestCenter('ICN', { name: '이천센터' })
  const gmh = await createTestCenter('GMH', { name: '김해센터' })
  // 센터마다 입고대기 창고 + 기본 로케이션 (입고 확정 재고가 들어가는 곳)
  const icnStaging = await ensureCenterDefaults(prisma, icn.id)
  await ensureCenterDefaults(prisma, gmh.id)
  const gana = await createTestShipper('GANA')
  const dara = await createTestShipper('DARA')
  await prisma.shipper.update({
    where: { id: gana.id },
    data: { centers: { create: [{ centerId: icn.id }] } },
  })
  await prisma.shipper.update({
    where: { id: dara.id },
    data: { centers: { create: [{ centerId: gmh.id }] } },
  })
  const unit = (code: string, kind: 'BASE' | 'PACK', decimals = 0) =>
    prisma.unit.create({ data: { operatorId: TEST_OPERATOR_ID, code, name: code, kind, decimals } })
  const ea = await unit('EA', 'BASE')
  const kg = await unit('KG', 'BASE', 3)
  const box = await unit('BOX', 'PACK')
  const plt = await unit('PLT', 'PACK')
  const item = (shipperId: bigint, code: string, baseUnitId: bigint, data = {}) =>
    prisma.item.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        shipperId,
        systemCode: `IT-T-${code}`,
        code,
        name: code,
        baseUnitId,
        ...data,
      },
    })
  const stagingLocation = await prisma.location.findFirstOrThrow({
    where: { warehouseId: icnStaging.id },
  })
  // 보관 창고(일반) + 로케이션 A-01·A-02 (이천), B-01 (김해)
  const storage = async (centerId: bigint, code: string, locations: string[]) => {
    const warehouse = await prisma.warehouse.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        centerId,
        systemCode: `WH-T-${code}`,
        code,
        name: code,
        tempZone: 'AMBIENT',
      },
    })
    const ids: bigint[] = []
    for (const location of locations) {
      ids.push(
        (
          await prisma.location.create({
            data: {
              operatorId: TEST_OPERATOR_ID,
              warehouseId: warehouse.id,
              code: location,
              name: location,
            },
          })
        ).id,
      )
    }
    return ids
  }
  const [a01, a02] = await storage(icn.id, 'GEN', ['A-01', 'A-02'])
  const [b01] = await storage(gmh.id, 'GMHGEN', ['B-01'])
  return {
    icn: icn.id,
    icnStaging: stagingLocation.id,
    a01,
    a02,
    b01,
    gmh: gmh.id,
    gana: gana.id,
    dara: dara.id,
    units: { ea: ea.id, kg: kg.id, box: box.id, plt: plt.id },
    water: (
      await item(gana.id, 'WATER', ea.id, {
        units: {
          create: [
            { unitId: box.id, convQty: '24' },
            { unitId: plt.id, convQty: '1440' },
          ],
        },
      })
    ).id,
    milk: (await item(gana.id, 'MILK', ea.id, { useLot: 'Y', useExpiry: 'Y' })).id,
    rice: (await item(gana.id, 'RICE', kg.id)).id,
    daraItem: (await item(dara.id, 'DARA1', ea.id)).id,
  }
}

export type InboundFixture = Awaited<ReturnType<typeof createInboundFixture>>
