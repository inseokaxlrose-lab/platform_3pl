import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { ACTIVE_ONLY } from '@/lib/status'
import { isSystemWarehouse } from '@/lib/warehouses/warehouse-codes'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 고를 수 있는 창고: 데이터 범위 안 + 사용 중인 센터의 창고 (센터 → 창고 → 구역 순서로 고르기)
// addable: 로케이션을 추가할 수 있는 창고인지 (일반 + 사용 중)
// zones: 그 창고에 있는 구역 (검색 조건 "구역" 선택지)
export async function getWarehouseOptions(scope: DataScope) {
  const scopeWhere = scopeFilter(scope, { center: 'warehouse.centerId' })
  const zoneRows = await prisma.location.findMany({
    where: { AND: [scopeWhere, { zone: { not: null } }] },
    distinct: ['warehouseId', 'zone'],
    select: { warehouseId: true, zone: true },
    orderBy: [{ warehouseId: 'asc' }, { zone: 'asc' }],
  })
  const zonesOf = (warehouseId: bigint) =>
    zoneRows.filter((z) => z.warehouseId === warehouseId).map((z) => z.zone!)
  const warehouses = await prisma.warehouse.findMany({
    // 사용 중인 센터의 사용 중인 창고만, 센터 정렬순서 → 창고 정렬순서 → 코드 순 (0074)
    where: {
      AND: [scopeFilter(scope, { center: 'centerId' }), { center: ACTIVE_ONLY }, ACTIVE_ONLY],
    },
    select: {
      id: true,
      code: true,
      name: true,
      systemYn: true,
      center: { select: { id: true, code: true, name: true } },
    },
    orderBy: [
      { center: { sortOrder: 'asc' } },
      { center: { code: 'asc' } },
      { sortOrder: 'asc' },
      { code: 'asc' },
    ],
  })
  // 화면으로 보낼 값이라 키는 글자로
  return textIds(
    warehouses.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      label: `${w.name} (${w.code})`,
      centerId: w.center.id,
      centerCode: w.center.code,
      centerName: w.center.name,
      centerLabel: `${w.center.name} (${w.center.code})`,
      // 시스템 기본 창고에는 로케이션을 더 만들 수 없다 (DEFAULT 하나만)
      addable: !isSystemWarehouse(w),
      zones: zonesOf(w.id),
    })),
  )
}

export type WarehouseOption = Awaited<ReturnType<typeof getWarehouseOptions>>[number]
