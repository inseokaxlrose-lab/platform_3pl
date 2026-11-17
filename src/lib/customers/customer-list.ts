import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { dateRangeFilter, deletedWhere, idFilter, statusWhere } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { getDefaultCenter } from '@/lib/regions/center-resolve'
import { TEMP_ZONE_ALL } from '@/lib/regions/region-codes'
import { DELETED_ONLY, isActiveStatus, withIsActive } from '@/lib/status'

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

// 거래처의 배송 센터 (0072 → 0076): 거래처 지정 → 권역설정(배송지 우편번호 → 배정표, 우편번호가 없으면 법정동)
// 목록 표시용: '서울센터 (지정)' / '이천센터 (권역)' / '미배정'. 출고 때 정식 결정은 resolveCenterByAddress
type CenterRow = {
  zipCode: string | null
  regionCode: string | null
  centerIds: bigint[]
  deliveryCenter: { id: bigint; name: string; status: string; delYn: string } | null
}

async function deliveryCentersOf(operatorId: bigint, rows: CenterRow[]) {
  const zipOf = (row: CenterRow) => {
    const digits = (row.zipCode ?? '').replace(/\D/g, '')
    return digits.length === 5 ? digits : null
  }
  const zips = [...new Set(rows.map(zipOf).filter((z): z is string => Boolean(z)))]
  const byZip = new Map(
    (zips.length
      ? await prisma.regionCenterMap.findMany({
          where: { operatorId, tempZone: TEMP_ZONE_ALL, zipCode: { in: zips } },
          select: { zipCode: true, center: { select: { name: true } } },
        })
      : []
    ).map((m) => [m.zipCode, m.center.name]),
  )
  return Promise.all(
    rows.map(async (row) => {
      // 거래처 지정 배송 센터 (이용 센터·사용 중일 때만)
      if (
        row.deliveryCenter &&
        row.centerIds.includes(row.deliveryCenter.id) &&
        isActiveStatus(row.deliveryCenter.status) &&
        row.deliveryCenter.delYn === 'N'
      ) {
        return `${row.deliveryCenter.name} (지정)`
      }
      const zip = zipOf(row)
      if (zip) return byZip.has(zip) ? `${byZip.get(zip)} (권역)` : '미배정'
      if (!row.regionCode) return null
      const center = await getDefaultCenter(prisma, operatorId, { bjdCode: row.regionCode })
      return center ? `${center.centerName} (권역)` : '미배정'
    }),
  )
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
  const centers = await deliveryCentersOf(
    scope.operatorId ?? 0n,
    rows.map((r) => ({
      zipCode: r.zipCode,
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
          // 배송할 센터: '서울센터 (지정)' / '이천센터 (권역)' / '미배정'
          deliveryCenter: centers[i],
        }
      }),
    rowCount,
  }
}
