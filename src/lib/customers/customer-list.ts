import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { dateRangeFilter, deletedWhere, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY, DELETED_ONLY, NOT_DELETED, withIsActive } from '@/lib/status'

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

// 거래처들이 드는 배송권역: 화주사가 이용하는 센터의 사용 중인 권역 중 지역이 맞는 것 ('이천센터: 경기남부권')
async function zonesOf(rows: { regionCode: string | null; centerIds: bigint[] }[]) {
  const prefixes = [
    ...new Set(rows.flatMap((r) => (r.regionCode ? regionPrefixes(r.regionCode) : []))),
  ]
  if (prefixes.length === 0) return rows.map(() => [] as string[])
  const regions = await prisma.deliveryZoneRegion.findMany({
    where: { regionCode: { in: prefixes }, zone: { ...NOT_DELETED, ...ACTIVE_ONLY } },
    select: {
      regionCode: true,
      zone: { select: { name: true, centerId: true, center: { select: { name: true } } } },
    },
  })
  return rows.map((row) => {
    if (!row.regionCode) return []
    const wanted = regionPrefixes(row.regionCode)
    return [
      ...new Set(
        regions
          .filter((r) => wanted.includes(r.regionCode) && row.centerIds.includes(r.zone.centerId))
          .map((r) => `${r.zone.center.name}: ${r.zone.name}`),
      ),
    ]
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
    })),
  )
  return {
    rows: rows
      .map(withIsActive)
      .map(({ shipper, address, addressDetail, regionCode, ...row }, i) => {
        void regionCode
        return {
          ...row,
          shipper: `${shipper.name} (${shipper.code})`,
          address: [address, addressDetail].filter(Boolean).join(' ') || null,
          // 이 거래처가 드는 배송권역 (화주사가 이용하는 센터별)
          zones: zones[i].join(', ') || null,
        }
      }),
    rowCount,
  }
}
