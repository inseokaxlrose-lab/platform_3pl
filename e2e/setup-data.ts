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

    // 휴무관리 (0096): e2e에는 공휴일 API 키가 없으므로 견본 국가 공휴일·개별 휴일을 넣는다 (도움말 사진용)
    const day = (text: string) => new Date(`${text}T00:00:00.000Z`)
    const national = [
      ['2026-01-01', '1월1일'],
      ['2026-02-16', '설날'],
      ['2026-02-17', '설날'],
      ['2026-02-18', '설날'],
      ['2026-03-01', '삼일절'],
      ['2026-03-02', '대체공휴일'],
      ['2026-05-05', '어린이날'],
      ['2026-12-25', '기독탄신일'],
    ] as const
    for (const [date, name] of national) {
      await prisma.holiday.upsert({
        where: { holidayOn_name: { holidayOn: day(date), name } },
        create: { holidayOn: day(date), name },
        update: {},
      })
    }
    await prisma.holidayYear.upsert({
      where: { year: 2026 },
      create: { year: 2026, status: 'OK', holidayCount: national.length },
      update: {},
    })
    const ownHolidays = [
      { centerId: null, date: '2026-02-14', name: '설 연휴 전 특근', dayType: 'OPEN' },
      { centerId: center.id, date: '2026-12-31', name: '연말 재고 실사', dayType: 'CLOSED' },
    ]
    for (const h of ownHolidays) {
      const found = await prisma.operatorHoliday.findFirst({
        where: { operatorId: operator.id, centerId: h.centerId, holidayOn: day(h.date) },
      })
      if (!found) {
        await prisma.operatorHoliday.create({
          data: {
            operatorId: operator.id,
            centerId: h.centerId,
            holidayOn: day(h.date),
            name: h.name,
            dayType: h.dayType,
          },
        })
      }
    }
  })
  console.log('e2e 준비 데이터 확인: 품목 E2E-WATER, 로케이션 E2EGEN/E2E-01, 견본 휴일')
}

main()
  .catch((error) => {
    console.error('e2e 준비 실패:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
