import 'server-only'
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
import { isYes } from '@/lib/yn'
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

// 숫자(Decimal) → 보기 좋은 글자 ('24.000' → '24', '2.500' → '2.5')
const qtyText = (value: { toString(): string }) => Number(value.toString()).toLocaleString('ko-KR')

// 목록 (검색 조건 키 — keyword·shipper·status·lot·expiry·createdAt, 권한·엑셀 검사는 서버 액션에서)
export async function listItems(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: ['code', 'systemCode', 'name', 'barcode', 'shipper.name', 'shipper.code'],
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
  // 로트·유통기한 거르기는 "실제로 적용되는 값" 기준 (품목이 비어 있으면 화주사 기본값)
  const optionWhere = (key: 'useLot' | 'useExpiry', value: 'Y' | 'N' | undefined) =>
    value === undefined
      ? {}
      : { OR: [{ [key]: value }, { [key]: null, shipper: { [key]: value } }] }
  const createdAt = dateRangeFilter(filters, 'createdAt')
  const where = {
    AND: [
      query.where,
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
        barcode: true,
        useLot: true,
        useExpiry: true,
        labelUnit: true,
        expiryAlertDays: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        shipper: {
          select: { code: true, name: true, useLot: true, useExpiry: true, labelUnit: true },
        },
        baseUnit: { select: { code: true } },
        units: {
          select: { convQty: true, unit: { select: { code: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.item.count({ where }),
  ])
  return {
    rows: rows.map(withIsActive).map(({ shipper, baseUnit, units, ...row }) => {
      const options = effectiveItemOptions(
        {
          useLot: row.useLot as 'Y' | 'N' | null,
          useExpiry: row.useExpiry as 'Y' | 'N' | null,
          labelUnit: row.labelUnit,
        },
        {
          useLot: isYes(shipper.useLot),
          useExpiry: isYes(shipper.useExpiry),
          labelUnit: shipper.labelUnit,
        },
      )
      return {
        id: row.id,
        systemCode: row.systemCode,
        code: row.code,
        name: row.name,
        spec: row.spec,
        barcode: row.barcode,
        shipper: `${shipper.name} (${shipper.code})`,
        baseUnit: baseUnit.code,
        // 환산단위 요약: 'BOX 24 · PLT 1,440'
        units: units.map((u) => `${u.unit.code} ${qtyText(u.convQty)}`).join(' · ') || null,
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
