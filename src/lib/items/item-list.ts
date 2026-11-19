import 'server-only'
import { shipperDefaultsSelect, shipperItemDefaults } from '@/lib/shippers/shipper-defaults'
import { ActionError } from '@/lib/actions/action-error'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import {
  dateRangeFilter,
  deletedWhere,
  idFilter,
  statusWhere,
  ynFilter,
} from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { DELETED_ONLY, withIsActive } from '@/lib/status'
import { formatQty } from '@/lib/units/convert'
import { effectiveItemOptions } from './item-schema'

// 품목 목록·범위 검사 (docs/decisions/0041) — 운영사 화면·화주 포털 서버 액션이 같이 쓴다
// 데이터 범위: 운영사 관리자 = 운영사 전체, 센터 직원 = 소속 센터를 이용하는 화주사의 품목, 화주사 사용자 = 자기 화주사

export const ITEM_SCOPE = { center: 'shipper.centers.some.centerId', shipper: 'shipperId' }
export const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }

// 고른 품목이 모두 범위 안에 있어야 한다 (하나라도 밖·없음이면 전체 거부). deleted: 지운 품목 중에서
export async function assertItemsInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const unique = [...new Set(ids)]
  const count = await prisma.item.count({
    where: {
      AND: [{ id: { in: unique } }, scopeFilter(scope, ITEM_SCOPE), deleted ? DELETED_ONLY : {}],
    },
  })
  if (count !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 품목이 섞여 있습니다.')
  }
  return unique
}

// 목록 (검색 조건 키 — keyword·shipper·status·lot·expiry·createdAt, 권한·엑셀 검사는 서버 액션에서)
export async function listItems(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: ['code', 'systemCode', 'name', 'shipper.name', 'shipper.code'],
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
  // 로트·기한 관리 여부는 품목의 명시값 (0083)
  const optionWhere = (key: 'useLot' | 'useExpiry', value: 'Y' | 'N' | undefined) =>
    value === undefined ? {} : { [key]: value }
  // 검색어는 바코드(어느 단위든)로도 찾는다
  const keyword = input.search.trim()
  const createdAt = dateRangeFilter(filters, 'createdAt')
  const where = {
    AND: [
      keyword
        ? { OR: [query.where, { barcodes: { some: { barcode: { contains: keyword } } } }] }
        : query.where,
      scopeFilter(scope, ITEM_SCOPE),
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      statusWhere(filters),
      deletedWhere(filters),
      optionWhere('useLot', ynFilter(filters, 'lot')),
      optionWhere('useExpiry', ynFilter(filters, 'expiry')),
      createdAt ? { createdAt } : {},
    ],
  }
  const [rows, rowCount] = await prisma.$transaction([
    prisma.item.findMany({
      ...query,
      where,
      select: {
        id: true,
        systemCode: true,
        code: true,
        name: true,
        spec: true,
        // 대표 바코드 (기본단위의 것을 먼저)
        barcodes: {
          where: { isPrimary: 'Y' },
          select: { barcode: true, unitId: true },
        },
        baseUnitId: true,
        useLot: true,
        useExpiry: true,
        labelUnit: true,
        expiryAlertDays: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        shipper: {
          select: { code: true, name: true, ...shipperDefaultsSelect },
        },
        baseUnit: { select: { code: true } },
        // 환산단위 (기본단위 행은 빼고)
        units: {
          where: { level: { not: 'BASE' } },
          select: { convQty: true, unit: { select: { code: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.item.count({ where }),
  ])
  return {
    rows: rows.map(withIsActive).map(({ shipper, baseUnit, units, barcodes, ...row }) => {
      const options = effectiveItemOptions(
        {
          useLot: row.useLot as 'Y' | 'N' | null,
          useExpiry: row.useExpiry as 'Y' | 'N' | null,
          labelUnit: row.labelUnit,
        },
        shipperItemDefaults(shipper),
      )
      return {
        id: row.id,
        systemCode: row.systemCode,
        code: row.code,
        name: row.name,
        spec: row.spec,
        barcode:
          (barcodes.find((b) => b.unitId === row.baseUnitId) ?? barcodes[0])?.barcode ?? null,
        shipper: `${shipper.name} (${shipper.code})`,
        baseUnit: baseUnit.code,
        // 환산단위 요약: 'BOX 24 · PLT 1,440'
        units: units.map((u) => `${u.unit.code} ${formatQty(u.convQty)}`).join(' · ') || null,
        useLot: options.useLot,
        useExpiry: options.useExpiry,
        labelUnit: options.labelUnit,
        // 라벨 단위의 입수량이 없으면 라벨을 발행할 수 없다 (저장은 허용, 목록에 표시 — 사용자 결정)
        labelUnitMissing: !units.some((u) => u.unit.code === options.labelUnit),
        expiryAlertDays: row.expiryAlertDays,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    }),
    rowCount,
  }
}
