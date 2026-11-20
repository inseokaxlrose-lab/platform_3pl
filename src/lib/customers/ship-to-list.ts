import 'server-only'
import { resolveShipToRoutes } from '@/lib/routes/route-resolve'
import { ActionError } from '@/lib/actions/action-error'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { codesFilter, idFilter, textFilter, ynFilter } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { NOT_DELETED } from '@/lib/status'

// 납품처 목록 (docs/decisions/0082 ② — 거래처 > 납품처 메뉴, 권한은 거래처와 같다)
// 운영사가 배송센터 "확인 필요"·"권역 불일치"를 모아 처리하는 화면. 데이터 범위는 거래처와 같다

export const SHIP_TO_SCOPE = { center: 'shipper.centers.some.centerId', shipper: 'shipperId' }

// 고른 납품처가 모두 범위 안이어야 한다 (하나라도 밖·없음이면 전체 거부)
export async function assertShipTosInScope(ids: bigint[], scope: DataScope) {
  const unique = [...new Set(ids)]
  const count = await prisma.shipTo.count({
    where: { AND: [{ id: { in: unique } }, scopeFilter(scope, SHIP_TO_SCOPE)] },
  })
  if (count !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 납품처가 섞여 있습니다.')
  }
  return unique
}

// 빠른 보기 (정의서 "기본 필터 프리셋")
const VIEWS: Record<string, object> = {
  NEED_CONFIRM: { status: 'ACTIVE', centerAssignStatus: 'NEED_CONFIRM' },
  MISMATCH: { regionMismatchYn: 'Y' },
  LOW_GRADE: { addressGrade: { in: ['C', 'D', 'F'] } },
}

// 검색 조건 키 — 기본: view·shipper·keyword·center·assignStatus / 상세: assignType·reason·grade·sigungu·source·status
export async function listShipTos(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: ['code', 'name', 'customer.code', 'customer.name'],
    sortable: {
      shipper: 'shipper.code',
      customerCode: 'customer.code',
      code: 'code',
      name: 'name',
      addressGrade: 'addressGrade',
      deliveryCenter: 'deliveryCenter.code',
      centerAssignStatus: 'centerAssignStatus',
      updatedAt: 'updatedAt',
    },
    // 거래처별로 모여 보이게 (거래처 키 순)
    defaultOrderBy: { customerId: 'asc' },
  })
  const center = idFilter(filters, 'center')
  const sigungu = textFilter(filters, 'sigungu')
  const where = {
    AND: [
      query.where,
      NOT_DELETED,
      // 지운 거래처의 납품처는 빼고
      { customer: NOT_DELETED },
      scopeFilter(scope, SHIP_TO_SCOPE),
      VIEWS[filters.view ?? ''] ?? {},
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      center ? { deliveryCenterId: center } : {},
      codesFilter(filters, 'assignStatus')
        ? { centerAssignStatus: codesFilter(filters, 'assignStatus') }
        : {},
      codesFilter(filters, 'assignType')
        ? { centerAssignType: codesFilter(filters, 'assignType') }
        : {},
      codesFilter(filters, 'reason') ? { centerConfirmReason: codesFilter(filters, 'reason') } : {},
      codesFilter(filters, 'grade') ? { addressGrade: codesFilter(filters, 'grade') } : {},
      codesFilter(filters, 'source') ? { source: codesFilter(filters, 'source') } : {},
      codesFilter(filters, 'status') ? { status: codesFilter(filters, 'status') } : {},
      ynFilter(filters, 'mismatch') ? { regionMismatchYn: ynFilter(filters, 'mismatch') } : {},
      sigungu ? { sigunguName: sigungu } : {},
    ],
  }
  const [rows, rowCount] = await prisma.$transaction([
    prisma.shipTo.findMany({
      ...query,
      where,
      select: {
        id: true,
        code: true,
        name: true,
        isDefault: true,
        status: true,
        address: true,
        addressDetail: true,
        sigunguName: true,
        addressGrade: true,
        centerAssignType: true,
        centerAssignStatus: true,
        centerConfirmReason: true,
        regionMismatchYn: true,
        source: true,
        updatedAt: true,
        customerId: true,
        // 배송 코스 (0095): 직접 지정 → 배송센터 + 우편번호 배정
        routeId: true,
        deliveryCenterId: true,
        zipCode: true,
        shipper: { select: { code: true, name: true } },
        customer: { select: { code: true, name: true } },
        deliveryCenter: { select: { code: true, name: true } },
        regionCenter: { select: { code: true, name: true } },
      },
    }),
    prisma.shipTo.count({ where }),
  ])
  const routes = await resolveShipToRoutes(prisma, rows)
  return {
    rows: rows.map(({ shipper, customer, deliveryCenter, regionCenter, ...row }, index) => ({
      ...row,
      route: routes[index]
        ? `${routes[index].name} (${routes[index].code})${routes[index].by === 'MANUAL' ? ' · 지정' : ''}`
        : null,
      shipper: `${shipper.name} (${shipper.code})`,
      customerCode: customer.code,
      customerName: customer.name,
      address: [row.address, row.addressDetail].filter(Boolean).join(' '),
      deliveryCenter: deliveryCenter ? `${deliveryCenter.name} (${deliveryCenter.code})` : null,
      regionCenter: regionCenter ? `${regionCenter.name} (${regionCenter.code})` : null,
    })),
    rowCount,
  }
}
