import 'server-only'
import type { DeliveryZoneInput } from '@/lib/delivery-zones/delivery-zone-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 센터별로 이미 담당 중인 지역 (담당 지역 고르기에서 "다른 권역이 사용 중"으로 흐리게)
// 센터 id → (지역 코드 → 권역 이름)
export type TakenRegions = Record<string, Record<string, string>>

export async function getTakenRegions(
  scope: DataScope,
  exceptZoneId?: string,
): Promise<TakenRegions> {
  const regions = await prisma.deliveryZoneRegion.findMany({
    where: {
      zone: {
        AND: [
          scopeFilter(scope, { center: 'centerId' }),
          exceptZoneId ? { id: { not: exceptZoneId } } : {},
        ],
      },
    },
    select: { regionCode: true, zone: { select: { centerId: true, name: true } } },
  })
  const taken: TakenRegions = {}
  for (const r of regions) {
    taken[r.zone.centerId] ??= {}
    taken[r.zone.centerId][r.regionCode] = r.zone.name
  }
  return taken
}

// 수정 화면용 권역 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getDeliveryZoneForEdit(id: string, scope: DataScope) {
  const zone = await prisma.deliveryZone.findUnique({
    where: { id },
    include: {
      center: { select: { id: true, code: true, name: true } },
      regions: { select: { regionCode: true } },
    },
  })
  if (!zone || !isInScope(scope, zone, { center: 'centerId' })) return null
  const input: DeliveryZoneInput = {
    centerId: zone.centerId,
    code: zone.code,
    name: zone.name,
    description: zone.description ?? '',
    regionCodes: zone.regions.map((r) => r.regionCode).sort(),
    externalCodes: await getExternalCodes('DELIVERY_ZONE', id),
  }
  return {
    id: zone.id,
    systemCode: zone.systemCode,
    isActive: zone.isActive,
    center: zone.center,
    input,
  }
}

export type DeliveryZoneForEdit = NonNullable<Awaited<ReturnType<typeof getDeliveryZoneForEdit>>>
