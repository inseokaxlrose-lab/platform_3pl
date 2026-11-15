import 'server-only'
import type { DeliveryZoneInput } from '@/lib/delivery-zones/delivery-zone-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isActiveStatus } from '@/lib/status'
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
    const centerKey = String(r.zone.centerId)
    taken[centerKey] ??= {}
    taken[centerKey][r.regionCode] = r.zone.name
  }
  return taken
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
    regionCodes: zone.regions.map((r) => r.regionCode).sort(),
    externalCodes: await getExternalCodes('DELIVERY_ZONE', id),
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
