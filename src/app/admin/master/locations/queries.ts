import 'server-only'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 고를 수 있는 창고: 데이터 범위 안 + 사용 중인 센터의 창고 (센터 → 창고 순서로 고르기)
// addable: 로케이션을 추가할 수 있는 창고인지 (일반 + 사용 중)
export async function getWarehouseOptions(scope: DataScope) {
  const warehouses = await prisma.warehouse.findMany({
    where: { AND: [scopeFilter(scope, { center: 'centerId' }), { center: { isActive: true } }] },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
      center: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ center: { code: 'asc' } }, { code: 'asc' }],
  })
  return warehouses.map((w) => ({
    id: w.id,
    label: `${w.name} (${w.code})`,
    centerId: w.center.id,
    centerLabel: `${w.center.name} (${w.center.code})`,
    addable: w.type === 'GENERAL' && w.isActive,
  }))
}

export type WarehouseOption = Awaited<ReturnType<typeof getWarehouseOptions>>[number]
