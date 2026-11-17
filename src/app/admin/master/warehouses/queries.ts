import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { NOT_DELETED } from '@/lib/status'
import type { WarehouseFormValue } from '@/lib/warehouses/warehouse-schema'
import { isYes } from '@/lib/yn'
import { CENTER_SETUP_ONLY } from '@/lib/centers/center-status'

// 센터 고르기 선택지 (CenterSelect): 데이터 범위 안, 정렬순서 → 코드 순 (키는 글자)
// setupOnly: 기준정보 준비가 되는 센터(준비중·운영중)만 — 창고 등록 화면
// 센터마다 취급 온도대를 함께 준다 (창고 온도대는 이 안에서 고른다)
export async function getCenterOptions(scope: DataScope, { setupOnly = false } = {}) {
  const centers = await prisma.center.findMany({
    where: { AND: [scopeFilter(scope, { center: 'id' }), setupOnly ? CENTER_SETUP_ONLY : {}] },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      tempZones: { select: { tempZoneCd: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  return textIds(
    centers.map(({ tempZones, ...c }) => ({
      ...c,
      tempZones: tempZones.map((z) => z.tempZoneCd),
    })),
  )
}

export type CenterOption = Awaited<ReturnType<typeof getCenterOptions>>[number]

// 수정 화면용 창고 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getWarehouseForEdit(id: bigint, scope: DataScope) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
    include: {
      center: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          tempZones: { select: { tempZoneCd: true } },
        },
      },
      // 기본 로케이션 고르기: 이 창고의 사용 중인 로케이션
      locations: {
        where: { ...NOT_DELETED, status: 'ACTIVE' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
        take: 3000,
      },
      // 관계 목록·개수는 지운 줄을 직접 뺀다 (NOT_DELETED)
      _count: { select: { locations: { where: NOT_DELETED } } },
    },
  })
  if (!warehouse || !isInScope(scope, warehouse, { center: 'centerId' })) return null
  const text = (value: string | null) => value ?? ''
  const input: WarehouseFormValue = {
    centerId: warehouse.centerId.toString(),
    code: warehouse.code,
    name: warehouse.name,
    type: warehouse.type,
    tempZone: warehouse.tempZone,
    description: text(warehouse.description),
    sortOrder: warehouse.sortOrder,
    remark: text(warehouse.remark),
    buildingName: text(warehouse.buildingName),
    floorNo: text(warehouse.floorNo),
    areaM2: warehouse.areaM2?.toString() ?? '',
    inbound: isYes(warehouse.inboundYn),
    outbound: isYes(warehouse.outboundYn),
    allocatable: isYes(warehouse.allocatableYn),
    defaultStockStatus: warehouse.defaultStockStatus,
    allocPriority: warehouse.allocPriority,
    defaultLocId: warehouse.defaultLocId?.toString() ?? '',
  }
  const { center } = warehouse
  // 화면으로 보낼 값이라 키는 글자로
  return textIds({
    id: warehouse.id,
    systemCode: warehouse.systemCode,
    // 동시 수정 막기: 저장할 때 이 버전을 함께 보낸다
    rowVersion: warehouse.rowVersion,
    status: warehouse.status,
    isSystem: isYes(warehouse.systemYn),
    updatedAt: warehouse.updatedAt,
    updatedBy: warehouse.updatedBy,
    center: {
      id: center.id,
      code: center.code,
      name: center.name,
      status: center.status,
      tempZones: center.tempZones.map((z) => z.tempZoneCd),
    },
    input,
    locationOptions: warehouse.locations.map((l) => ({
      value: l.id.toString(),
      label: l.code,
      description: l.name && l.name !== l.code ? l.name : undefined,
    })),
    locationCount: warehouse._count.locations,
  })
}

export type WarehouseForEdit = NonNullable<Awaited<ReturnType<typeof getWarehouseForEdit>>>
