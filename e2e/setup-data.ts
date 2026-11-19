// 브라우저 테스트(e2e) 준비 데이터 (docs/decisions/0065) — 시드 다음에 실행, 여러 번 실행해도 안전
// 예시 운영사(가장 먼저 만든 운영사)의 가나식품(GANA, 로트·유통기한 사용)에
// - 품목 E2E-WATER (기본단위 EA, BOX 24, PLT 1,440)
// - 이천센터(ICN) 보관 창고 E2EGEN + 로케이션 E2E-01
// 실행: DATABASE_URL을 e2e DB로 바꿔서 (scripts/e2e-prepare.sh가 한다)
import 'dotenv/config'
import { runInContext } from '../src/lib/actor'
import { prisma } from '../src/lib/prisma'
import { E2E_ITEM, E2E_LOCATION } from './e2e-env'

async function main() {
  const operator = await prisma.operator.findFirstOrThrow({ orderBy: { id: 'asc' } })
  await runInContext({ actor: 'e2e', operatorId: operator.id }, async () => {
    const shipper = await prisma.shipper.findFirstOrThrow({ where: { code: 'GANA' } })
    const center = await prisma.center.findFirstOrThrow({ where: { code: 'ICN' } })
    const unit = (code: string) => prisma.unit.findFirstOrThrow({ where: { code } })
    const [ea, box, plt] = await Promise.all([unit('EA'), unit('BOX'), unit('PLT')])

    const item =
      (await prisma.item.findFirst({ where: { shipperId: shipper.id, code: E2E_ITEM.code } })) ??
      (await prisma.item.create({
        data: {
          operatorId: operator.id,
          shipperId: shipper.id,
          systemCode: 'IT-E2E-1',
          code: E2E_ITEM.code,
          name: E2E_ITEM.name,
          baseUnitId: ea.id,
          expiryAlertDays: 30,
        },
      }))
    // 단위 레벨별 1행 (BASE = 기본단위, 0083)
    for (const [pack, convQty, level, sortOrder] of [
      [ea, '1', 'BASE', 0],
      [box, '24', 'BOX', 1],
      [plt, '1440', 'PLT', 2],
    ] as const) {
      await prisma.itemUnit.upsert({
        where: { itemId_unitId: { itemId: item.id, unitId: pack.id } },
        create: { itemId: item.id, unitId: pack.id, convQty, level, sortOrder },
        update: {},
      })
    }

    const warehouse =
      (await prisma.warehouse.findFirst({
        where: { centerId: center.id, code: E2E_LOCATION.warehouse },
      })) ??
      (await prisma.warehouse.create({
        data: {
          operatorId: operator.id,
          centerId: center.id,
          systemCode: 'WH-E2E-1',
          code: E2E_LOCATION.warehouse,
          name: 'E2E 보관창고',
          tempZone: 'AMBIENT',
        },
      }))
    await prisma.location.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: E2E_LOCATION.code } },
      create: {
        operatorId: operator.id,
        warehouseId: warehouse.id,
        code: E2E_LOCATION.code,
        centerId: center.id,
      },
      update: {},
    })
  })
  console.log('e2e 준비 데이터 확인: 품목 E2E-WATER, 로케이션 E2EGEN/E2E-01')
}

main()
  .catch((error) => {
    console.error('e2e 준비 실패:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
