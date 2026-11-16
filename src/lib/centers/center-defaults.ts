import 'server-only'
import { nextSystemCode, type Db } from '@/lib/master-code/system-code'

// 센터 기본 구성 (docs/decisions/0026, 0073, 0003 결정 1)
// 센터마다 대기 창고 3개(입고대기·출고대기·반품대기) + 각 창고의 기본 로케이션 DEFAULT
// → 재고가 적치·출고·반품 판정 전까지 머물 곳 ("재고는 항상 로케이션에 있다" 규칙을 예외 없이 지키기 위해)
// 그리고 센터의 기본 입고·출고·반품 로케이션 칸에 연결한다 (비어 있을 때만)

export const STAGING_WAREHOUSES = [
  { type: 'INBOUND_STAGING', code: 'INBOUND', name: '입고대기', field: 'defaultInboundLocId' },
  { type: 'OUTBOUND_STAGING', code: 'OUTBOUND', name: '출고대기', field: 'defaultOutboundLocId' },
  { type: 'RETURN_STAGING', code: 'RETURN', name: '반품대기', field: 'defaultReturnLocId' },
] as const
export const INBOUND_STAGING_WAREHOUSE = STAGING_WAREHOUSES[0]
export const DEFAULT_LOCATION_CODE = 'DEFAULT'

// 없으면 만들고 있으면 그대로 (여러 번 불러도 안전): 센터 등록·시드·보정이 같이 쓴다
// 센터 등록과 같은 트랜잭션(db)에서 부르면, 센터와 기본 구성이 함께 만들어지거나 함께 취소된다
// 창고·로케이션의 운영사는 센터의 운영사를 따른다 (출입증이 없는 시드·테스트에서도 같게)
// 돌려주는 값: 입고대기 창고 (입고 확정·테스트가 쓴다)
export async function ensureCenterDefaults(db: Db, centerId: bigint) {
  const center = await db.center.findUniqueOrThrow({
    where: { id: centerId },
    select: {
      operatorId: true,
      defaultInboundLocId: true,
      defaultOutboundLocId: true,
      defaultReturnLocId: true,
    },
  })
  const { operatorId } = center
  const links: Partial<Record<(typeof STAGING_WAREHOUSES)[number]['field'], bigint>> = {}
  let inbound: { id: bigint } | null = null

  for (const staging of STAGING_WAREHOUSES) {
    let warehouse = await db.warehouse.findFirst({
      where: { centerId, type: staging.type },
      select: { id: true },
    })
    if (!warehouse) {
      // 같은 코드를 일반 창고가 이미 쓰고 있으면 코드 뒤에 _STG (마이그레이션 보정과 같은 규칙)
      const taken = await db.warehouse.findFirst({
        where: { centerId, code: staging.code },
        select: { id: true },
      })
      warehouse = await db.warehouse.create({
        data: {
          operatorId,
          centerId,
          systemCode: await nextSystemCode('WAREHOUSE', db),
          code: taken ? `${staging.code}_STG` : staging.code,
          name: staging.name,
          type: staging.type,
        },
        select: { id: true },
      })
    }
    const location = await db.location.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: DEFAULT_LOCATION_CODE } },
      // 명칭은 코드와 같게 (0071)
      create: {
        operatorId,
        warehouseId: warehouse.id,
        code: DEFAULT_LOCATION_CODE,
        name: DEFAULT_LOCATION_CODE,
      },
      update: {},
      select: { id: true },
    })
    if (!center[staging.field]) links[staging.field] = location.id
    if (staging.type === 'INBOUND_STAGING') inbound = warehouse
  }

  if (Object.keys(links).length > 0) {
    await db.center.update({ where: { id: centerId }, data: links })
  }
  return inbound!
}
