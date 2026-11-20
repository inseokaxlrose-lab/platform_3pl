import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import {
  codesFilter,
  dateRangeFilter,
  deletedWhere,
  idFilter,
  textFilter,
} from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { DELETED_ONLY, NOT_DELETED } from '@/lib/status'

// 거래처 목록·범위 검사 (docs/decisions/0043, 0082)
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

const ALIVE_SHIP_TO = { ...NOT_DELETED }
const NEED_CONFIRM = { ...NOT_DELETED, status: 'ACTIVE', centerAssignStatus: 'NEED_CONFIRM' }

// 목록 (검색 조건 키 — 기본: shipper·keyword·status / 상세: role·type·group·orderAddrMode·source·needConfirm·createdAt)
export async function listCustomers(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: [
      'code',
      'custCode',
      'name',
      'shortName',
      'businessNumber',
      'shipper.name',
      'shipper.code',
    ],
    sortable: {
      code: 'code',
      custCode: 'custCode',
      name: 'name',
      shipper: 'shipper.code',
      customerType: 'customerType',
      customerGroup: 'customerGroup',
      status: 'status',
      source: 'source',
      lastIfAt: 'lastIfAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    defaultOrderBy: { code: 'asc' },
  })
  // 상태: 거래중·거래중지 (삭제됨은 deletedWhere)
  const statuses = codesFilter(filters, 'status')?.in.filter((s) => s !== 'DELETED')
  const createdAt = dateRangeFilter(filters, 'createdAt')
  const where = {
    AND: [
      query.where,
      scopeFilter(scope, CUSTOMER_SCOPE),
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      statuses?.length ? { status: { in: statuses } } : {},
      deletedWhere(filters),
      codesFilter(filters, 'customerType')
        ? { customerType: codesFilter(filters, 'customerType') }
        : {},
      textFilter(filters, 'customerGroup')
        ? { customerGroup: textFilter(filters, 'customerGroup') }
        : {},
      codesFilter(filters, 'orderAddrMode')
        ? { orderAddrMode: codesFilter(filters, 'orderAddrMode') }
        : {},
      // 역할 (0090)
      codesFilter(filters, 'role') ? { role: codesFilter(filters, 'role') } : {},
      codesFilter(filters, 'source') ? { source: codesFilter(filters, 'source') } : {},
      // 배송센터 확인이 필요한 납품처가 있는 거래처
      filters.needConfirm === 'Y' ? { shipTos: { some: NEED_CONFIRM } } : {},
      filters.needConfirm === 'N' ? { shipTos: { none: NEED_CONFIRM } } : {},
      createdAt ? { createdAt } : {},
    ],
  }
  const [rows, rowCount] = await prisma.$transaction([
    prisma.customer.findMany({
      ...query,
      where,
      select: {
        id: true,
        code: true,
        custCode: true,
        name: true,
        customerType: true,
        role: true,
        customerGroup: true,
        businessNumber: true,
        phone: true,
        status: true,
        source: true,
        lastIfAt: true,
        createdAt: true,
        updatedAt: true,
        shipper: { select: { code: true, name: true } },
        shipTos: {
          where: { ...ALIVE_SHIP_TO, isDefault: 'Y' },
          select: { sigunguName: true, address: true, deliveryCenter: { select: { name: true } } },
          take: 1,
        },
        _count: { select: { shipTos: { where: ALIVE_SHIP_TO } } },
      },
    }),
    prisma.customer.count({ where }),
  ])
  // 확인 필요 납품처 수 (한 페이지 거래처를 한 번에)
  const needCounts = await prisma.shipTo.groupBy({
    by: ['customerId'],
    where: { customerId: { in: rows.map((r) => r.id) }, ...NEED_CONFIRM },
    _count: { _all: true },
  })
  const needOf = new Map(needCounts.map((n) => [n.customerId, n._count._all]))
  return {
    rows: rows.map(({ shipper, shipTos, _count, ...row }) => ({
      ...row,
      shipper: `${shipper.name} (${shipper.code})`,
      // 기본 납품처: 시군구 (없으면 주소 앞부분)
      defaultShipTo:
        shipTos[0]?.sigunguName ?? shipTos[0]?.address?.split(' ').slice(0, 2).join(' ') ?? null,
      deliveryCenter: shipTos[0]?.deliveryCenter?.name ?? null,
      shipToCount: _count.shipTos,
      needConfirmCount: needOf.get(row.id) ?? 0,
    })),
    rowCount,
  }
}
