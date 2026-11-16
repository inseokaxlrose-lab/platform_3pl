import 'server-only'
import type { DeliveryZoneInput } from '@/lib/delivery-zones/delivery-zone-schema'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { ACTIVE_ONLY, NOT_DELETED, isActiveStatus } from '@/lib/status'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 센터별로 이미 담당 중인 지역 (담당 지역 고르기에서 "다른 권역이 사용 중"으로 흐리게)
// 센터 키(글자) → (지역 코드 → 권역 이름)
export type TakenRegions = Record<string, Record<string, string>>

export async function getTakenRegions(
  scope: DataScope,
  exceptZoneId?: bigint,
): Promise<TakenRegions> {
  const regions = await prisma.deliveryZoneRegion.findMany({
    where: {
      // 지운 권역의 담당 지역은 비어 있는 것으로 본다
      zone: {
        AND: [
          scopeFilter(scope, { center: 'centerId' }),
          NOT_DELETED,
          exceptZoneId ? { id: { not: exceptZoneId } } : {},
        ],
      },
    },
    select: { regionCode: true, zone: { select: { centerId: true, name: true } } },
  })
  const taken: TakenRegions = {}
  for (const r of regions) {
    const centerKey = String(r.zone.centerId)
    taken[centerKey] ??= {}
    taken[centerKey][r.regionCode] = r.zone.name
  }
  return taken
}

// 모든 센터 권역의 담당 지역 + 센터 이름·우선순위 (0072): 입력 화면에서 "다른 센터와 겹침" 안내에 쓴다
// 데이터 범위 안의 권역만 (센터 직원은 소속 센터끼리만 비교된다), 사용 중인 권역만
export type ZoneRegionInfo = {
  centerId: string
  regionCode: string
  zoneName: string
  centerName: string
  priority: number
}

export async function getOtherZoneRegions(
  scope: DataScope,
  exceptZoneId?: bigint,
): Promise<ZoneRegionInfo[]> {
  const regions = await prisma.deliveryZoneRegion.findMany({
    where: {
      zone: {
        AND: [
          scopeFilter(scope, { center: 'centerId' }),
          NOT_DELETED,
          ACTIVE_ONLY,
          exceptZoneId ? { id: { not: exceptZoneId } } : {},
        ],
      },
    },
    select: {
      regionCode: true,
      zone: {
        select: { centerId: true, name: true, priority: true, center: { select: { name: true } } },
      },
    },
  })
  return regions.map((r) => ({
    centerId: String(r.zone.centerId),
    regionCode: r.regionCode,
    zoneName: r.zone.name,
    centerName: r.zone.center.name,
    priority: r.zone.priority,
  }))
}

// 수정 화면용 권역 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getDeliveryZoneForEdit(id: bigint, scope: DataScope) {
  const zone = await prisma.deliveryZone.findUnique({
    where: { id },
    include: {
      center: { select: { id: true, code: true, name: true } },
      regions: { select: { regionCode: true } },
    },
  })
  if (!zone || !isInScope(scope, zone, { center: 'centerId' })) return null
  const input: DeliveryZoneInput = {
    centerId: String(zone.centerId),
    code: zone.code,
    name: zone.name,
    description: zone.description ?? '',
    priority: zone.priority,
    regionCodes: zone.regions.map((r) => r.regionCode).sort(),
  }
  // 화면으로 보낼 값이라 키는 글자로
  return textIds({
    id: zone.id,
    systemCode: zone.systemCode,
    // 동시 수정 막기: 저장할 때 이 버전을 함께 보낸다
    rowVersion: zone.rowVersion,
    isActive: isActiveStatus(zone.status),
    center: zone.center,
    input,
  })
}

export type DeliveryZoneForEdit = NonNullable<Awaited<ReturnType<typeof getDeliveryZoneForEdit>>>
