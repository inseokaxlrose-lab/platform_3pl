import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { dateRangeFilter, deletedWhere, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { matchRegion, pickDeliveryZone, type ZoneCandidate } from '@/lib/delivery-zones/routing'
import { ACTIVE_ONLY, DELETED_ONLY, NOT_DELETED, isActiveStatus, withIsActive } from '@/lib/status'

// 거래처 목록·범위 검사 (docs/decisions/0043)
// 데이터 범위: 운영사 관리자 = 운영사 전체, 센터 직원 = 소속 센터를 이용하는 화주사의 거래처, 화주사 사용자 = 자기 화주사

export const CUSTOMER_SCOPE = { center: 'shipper.centers.some.centerId', shipper: 'shipperId' }
export const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }

// 고른 거래처가 모두 범위 안에 있어야 한다 (하나라도 밖·없음이면 전체 거부). deleted: 지운 거래처 중에서
export async function assertCustomersInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const unique = [...new Set(ids)]
  const count = await prisma.customer.count({
    where: {
      AND: [
        { id: { in: unique } },
        scopeFilter(scope, CUSTOMER_SCOPE),
        deleted ? DELETED_ONLY : {},
      ],
    },
  })
  if (count !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 거래처가 섞여 있습니다.')
  }
  return unique
}

// 법정동코드(10자리) → 배송권역 지역 코드 후보 (시·도 2자리, 시·군·구 5자리, 0033)
export const regionPrefixes = (regionCode: string) => [
  regionCode.slice(0, 2),
  regionCode.slice(0, 5),
]

// 거래처들이 드는 배송권역과 배송 센터 (0043, 0072)
// - 배송권역: 화주사가 이용하는 센터의 사용 중인 권역 중 지역이 맞는 것 ('이천센터: 경기남부권')
// - 배송 센터: 거래처 지정 → 더 구체적인 지역 → 우선순위 → 배정 대기 (resolveDeliveryCenter와 같은 규칙)
type ZoneRow = {
  regionCode: string | null
  centerIds: bigint[]
  deliveryCenter: { id: bigint; name: string; status: string; delYn: string } | null
}

async function zonesOf(rows: ZoneRow[]) {
  const prefixes = [
    ...new Set(rows.flatMap((r) => (r.regionCode ? regionPrefixes(r.regionCode) : []))),
  ]
  const regions =
    prefixes.length === 0
      ? []
      : await prisma.deliveryZoneRegion.findMany({
          where: {
            regionCode: { in: prefixes },
            zone: {
              ...NOT_DELETED,
              ...ACTIVE_ONLY,
              center: { ...NOT_DELETED, ...ACTIVE_ONLY },
            },
          },
          select: {
            regionCode: true,
            zone: {
              select: {
                id: true,
                name: true,
                priority: true,
                centerId: true,
                center: { select: { name: true } },
              },
            },
          },
        })
  return rows.map((row) => {
    // 거래처 지정 배송 센터 (이용 센터·사용 중일 때만)
    const fixed =
      row.deliveryCenter &&
      row.centerIds.includes(row.deliveryCenter.id) &&
      isActiveStatus(row.deliveryCenter.status) &&
      row.deliveryCenter.delYn === 'N'
        ? `${row.deliveryCenter.name} (지정)`
        : null
    if (!row.regionCode) return { zones: [] as string[], center: fixed }
    const wanted = regionPrefixes(row.regionCode)
    const matched = regions.filter(
      (r) => wanted.includes(r.regionCode) && row.centerIds.includes(r.zone.centerId),
    )
    const zones = [...new Set(matched.map((r) => `${r.zone.center.name}: ${r.zone.name}`))]
    if (fixed) return { zones, center: fixed }
    // 권역 하나에 한 후보 (가장 구체적인 지역으로)
    const byZone = new Map<bigint, ZoneCandidate>()
    for (const r of matched) {
      const regionOfZone = matched.filter((m) => m.zone.id === r.zone.id).map((m) => m.regionCode)
      const region = matchRegion(regionOfZone, row.regionCode)
      if (!region) continue
      byZone.set(r.zone.id, {
        zoneId: String(r.zone.id),
        zoneName: r.zone.name,
        centerId: String(r.zone.centerId),
        centerName: r.zone.center.name,
        matchedRegion: region,
        priority: r.zone.priority,
      })
    }
    const { picked, tied } = pickDeliveryZone([...byZone.values()])
    const center = picked
      ? `${picked.centerName} (자동)`
      : tied.length > 0
        ? `배정 대기 (${tied.length}곳)`
        : null
    return { zones, center }
  })
}

// 목록 (검색 조건 키 — keyword·shipper·status·createdAt, 권한·엑셀 검사는 서버 액션에서)
export async function listCustomers(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: [
      'code',
      'systemCode',
      'name',
      'businessNumber',
      'address',
      'receiverName',
      'shipper.name',
      'shipper.code',
    ],
    sortable: {
      code: 'code',
      name: 'name',
      shipper: 'shipper.code',
      isActive: 'status',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    defaultOrderBy: { code: 'asc' },
  })
  const createdAt = dateRangeFilter(filters, 'createdAt')
  const where = {
    AND: [
      query.where,
      scopeFilter(scope, CUSTOMER_SCOPE),
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      statusWhere(filters),
      deletedWhere(filters),
      createdAt ? { createdAt } : {},
    ],
  }
  const [rows, rowCount] = await prisma.$transaction([
    prisma.customer.findMany({
      ...query,
      where,
      select: {
        id: true,
        systemCode: true,
        code: true,
        name: true,
        businessNumber: true,
        phone: true,
        zipCode: true,
        address: true,
        addressDetail: true,
        regionCode: true,
        deliveryCenter: { select: { id: true, name: true, status: true, delYn: true } },
        receiverName: true,
        receiverPhone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        shipper: {
          select: { code: true, name: true, centers: { select: { centerId: true } } },
        },
      },
    }),
    prisma.customer.count({ where }),
  ])
  const zones = await zonesOf(
    rows.map((r) => ({
      regionCode: r.regionCode,
      centerIds: r.shipper.centers.map((c) => c.centerId),
      deliveryCenter: r.deliveryCenter,
    })),
  )
  return {
    rows: rows
      .map(withIsActive)
      .map(({ shipper, address, addressDetail, regionCode, deliveryCenter, ...row }, i) => {
        void regionCode
        void deliveryCenter
        return {
          ...row,
          shipper: `${shipper.name} (${shipper.code})`,
          address: [address, addressDetail].filter(Boolean).join(' ') || null,
          // 이 거래처가 드는 배송권역 (화주사가 이용하는 센터별)
          zones: zones[i].zones.join(', ') || null,
          // 출고 때 배송할 센터 (0072): '서울센터 (지정)' / '경기센터 (자동)' / '배정 대기 (2곳)'
          deliveryCenter: zones[i].center,
        }
      }),
    rowCount,
  }
}
