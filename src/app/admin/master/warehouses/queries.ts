import 'server-only'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { ACTIVE_ONLY, NOT_DELETED, isActiveStatus, withIsActive } from '@/lib/status'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import type { WarehouseUpdateInput } from '@/lib/warehouses/warehouse-schema'

// 고를 수 있는 센터: 데이터 범위 안 + 사용 중 (등록 화면·목록 센터 고르기, 키는 글자)
export async function getCenterOptions(scope: DataScope) {
  const centers = await prisma.center.findMany({
    where: { AND: [scopeFilter(scope, { center: 'id' }), ACTIVE_ONLY] },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  })
  return textIds(centers)
}

export type CenterOption = Awaited<ReturnType<typeof getCenterOptions>>[number]

// 수정 화면용 창고 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getWarehouseForEdit(id: bigint, scope: DataScope) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    include: {
      center: { select: { id: true, code: true, name: true } },
      // 관계 목록·개수는 지운 줄을 직접 뺀다 (NOT_DELETED)
      locations: {
        where: NOT_DELETED,
        select: { code: true, status: true },
        orderBy: { code: 'asc' },
        take: 20,
      },
      _count: { select: { locations: { where: NOT_DELETED } } },
    },
  })
  if (!warehouse || !isInScope(scope, warehouse, { center: 'centerId' })) return null
  const input: WarehouseUpdateInput = {
    code: warehouse.code,
    name: warehouse.name,
    storageCondition: warehouse.storageCondition,
    externalCodes: await getExternalCodes('WAREHOUSE', id),
  }
  // 화면으로 보낼 값이라 키는 글자로
  return textIds({
    id: warehouse.id,
    systemCode: warehouse.systemCode,
    // 동시 수정 막기: 저장할 때 이 버전을 함께 보낸다
    rowVersion: warehouse.rowVersion,
    type: warehouse.type,
    isActive: isActiveStatus(warehouse.status),
    center: warehouse.center,
    input,
    locations: warehouse.locations.map(withIsActive),
    locationCount: warehouse._count.locations,
  })
}

export type WarehouseForEdit = NonNullable<Awaited<ReturnType<typeof getWarehouseForEdit>>>
