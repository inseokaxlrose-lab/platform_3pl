import 'server-only'
import { nextSystemCode, type Db } from '@/lib/master-code/system-code'

// 센터 기본 구성 (docs/decisions/0026, 0003 결정 1)
// 센터마다 입고대기 창고 1개 + 그 안의 기본 로케이션 1개가 있어야 한다
// → 입고 확정된 재고가 적치 전까지 머물 곳 ("재고는 항상 로케이션에 있다" 규칙을 예외 없이 지키기 위해)

export const INBOUND_STAGING_WAREHOUSE = { code: 'INBOUND', name: '입고대기' } as const
export const DEFAULT_LOCATION_CODE = 'DEFAULT'

// 없으면 만들고 있으면 그대로 (여러 번 불러도 안전): 센터 등록·시드가 같이 쓴다
// 센터 등록과 같은 트랜잭션(db)에서 부르면, 센터와 기본 구성이 함께 만들어지거나 함께 취소된다
// 창고·로케이션의 운영사는 센터의 운영사를 따른다 (출입증이 없는 시드·테스트에서도 같게)
export async function ensureCenterDefaults(db: Db, centerId: bigint) {
  const { operatorId } = await db.center.findUniqueOrThrow({
    where: { id: centerId },
    select: { operatorId: true },
  })
  let warehouse = await db.warehouse.findFirst({
    where: { centerId, type: 'INBOUND_STAGING' },
    select: { id: true },
  })
  if (!warehouse) {
    warehouse = await db.warehouse.create({
      data: {
        operatorId,
        centerId,
        systemCode: await nextSystemCode('WAREHOUSE', db),
        code: INBOUND_STAGING_WAREHOUSE.code,
        name: INBOUND_STAGING_WAREHOUSE.name,
        type: 'INBOUND_STAGING',
      },
      select: { id: true },
    })
  }
  await db.location.upsert({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: DEFAULT_LOCATION_CODE } },
    create: { operatorId, warehouseId: warehouse.id, code: DEFAULT_LOCATION_CODE },
    update: {},
  })
  return warehouse
}
