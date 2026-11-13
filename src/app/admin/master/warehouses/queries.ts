import 'server-only'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import type { WarehouseUpdateInput } from '@/lib/warehouses/warehouse-schema'

// 고를 수 있는 센터: 데이터 범위 안 + 사용 중 (등록 화면·목록 센터 고르기)
export async function getCenterOptions(scope: DataScope) {
  return prisma.center.findMany({
    where: { AND: [scopeFilter(scope, { center: 'id' }), { isActive: true }] },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  })
}

export type CenterOption = Awaited<ReturnType<typeof getCenterOptions>>[number]

// 수정 화면용 창고 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getWarehouseForEdit(id: string, scope: DataScope) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    include: {
      center: { select: { id: true, code: true, name: true } },
      locations: { select: { code: true, isActive: true }, orderBy: { code: 'asc' }, take: 20 },
      _count: { select: { locations: true } },
    },
  })
  if (!warehouse || !isInScope(scope, warehouse, { center: 'centerId' })) return null
  const input: WarehouseUpdateInput = {
    code: warehouse.code,
    name: warehouse.name,
    storageCondition: warehouse.storageCondition,
    externalCodes: await getExternalCodes('WAREHOUSE', id),
  }
  return {
    id: warehouse.id,
    systemCode: warehouse.systemCode,
    type: warehouse.type,
    isActive: warehouse.isActive,
    center: warehouse.center,
    input,
    locations: warehouse.locations,
    locationCount: warehouse._count.locations,
  }
}

export type WarehouseForEdit = NonNullable<Awaited<ReturnType<typeof getWarehouseForEdit>>>
