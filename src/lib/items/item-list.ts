import 'server-only'
import { shipperDefaultsSelect, shipperItemDefaults } from '@/lib/shippers/shipper-defaults'
import { ActionError } from '@/lib/actions/action-error'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import {
  codesFilter,
  dateRangeFilter,
  deletedWhere,
  idFilter,
  textFilter,
  ynFilter,
} from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { DELETED_ONLY } from '@/lib/status'
import type { Prisma } from '@/generated/prisma/client'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { formatQty, parseQty, qtyText } from '@/lib/units/convert'
import {
  EXPIRY_TYPE,
  ITEM_SOURCE,
  ITEM_STATUS,
  ITEM_TYPE,
  type ExpiryTypeKey,
  type ItemSourceKey,
  type ItemTypeKey,
} from './item-codes'
import { effectiveItemOptions } from './item-schema'

// 품목 목록·범위 검사 (docs/decisions/0041, 0083 ②) — 운영사 화면·화주 포털 서버 액션이 같이 쓴다
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

// 체적 등록 = BOX 행에 가로·세로·높이·총중량이 모두 있음 (정의서 2장 — 없으면 "체적 미등록")
const VOLUME_OK = {
  units: {
    some: {
      level: 'BOX',
      widthCm: { not: null },
      depthCm: { not: null },
      heightCm: { not: null },
      grossWeightKg: { not: null },
    },
  },
} satisfies Prisma.ItemWhereInput
const PLT_EXISTS = { units: { some: { level: 'PLT' } } } satisfies Prisma.ItemWhereInput

// 예/아니오 거르기 → 조건 (Y면 yes 조건, N이면 그 반대)
const ynWhere = (value: 'Y' | 'N' | undefined, yes: Prisma.ItemWhereInput) =>
  value === undefined ? {} : value === 'Y' ? yes : { NOT: yes }

// 상태: 사용·사용중지·단종 (삭제됨은 deletedWhere)
const itemStatusWhere = (value: string | undefined) =>
  value && (ITEM_STATUS.values as readonly string[]).includes(value) ? { status: value } : {}

// 목록 (검색 조건 키 — keyword·shipper·status·itemType·category1·brand·tempZone·expiry·lot·hazmat·
// volumeMissing·pltMissing·source·createdAt, 권한·엑셀 검사는 서버 액션에서)
export async function listItems(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: ['code', 'systemCode', 'name', 'shipper.name', 'shipper.code'],
    sortable: {
      code: 'code',
      name: 'name',
      shipper: 'shipper.code',
      itemType: 'itemType',
      category1: 'category1',
      tempZone: 'tempZone',
      status: 'status',
      lastIfAt: 'lastIfAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    defaultOrderBy: { code: 'asc' },
  })
  // 검색어는 바코드(어느 단위든)로도 찾는다
  const keyword = input.search.trim()
  const createdAt = dateRangeFilter(filters, 'createdAt')
  const category1 = textFilter(filters, 'category1')
  const brandName = textFilter(filters, 'brand')
  const itemType = codesFilter(filters, 'itemType')
  const tempZone = codesFilter(filters, 'tempZone')
  const source = codesFilter(filters, 'source')
  const where: Prisma.ItemWhereInput = {
    AND: [
      keyword
        ? { OR: [query.where, { barcodes: { some: { barcode: { contains: keyword } } } }] }
        : query.where,
      scopeFilter(scope, ITEM_SCOPE),
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      itemStatusWhere(filters.status),
      deletedWhere(filters),
      itemType ? { itemType } : {},
      category1 ? { category1 } : {},
      brandName ? { brandName } : {},
      tempZone ? { tempZone } : {},
      source ? { source } : {},
      // 로트·기한 관리 여부는 품목의 명시값 (0083)
      ynWhere(ynFilter(filters, 'lot'), { useLot: 'Y' }),
      ynWhere(ynFilter(filters, 'expiry'), { useExpiry: 'Y' }),
      ynWhere(ynFilter(filters, 'hazmat'), { hazmatYn: 'Y' }),
      // 미등록 거르기: Y = 미등록만, N = 등록된 것만
      ynWhere(ynFilter(filters, 'volumeMissing'), { NOT: VOLUME_OK }),
      ynWhere(ynFilter(filters, 'pltMissing'), { NOT: PLT_EXISTS }),
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
        itemType: true,
        category1: true,
        tempZone: true,
        useExpiry: true,
        expiryType: true,
        shelfLifeDays: true,
        useLot: true,
        labelUnit: true,
        expiryAlertDays: true,
        palletBoxQty: true,
        status: true,
        source: true,
        lastIfAt: true,
        createdAt: true,
        updatedAt: true,
        // 대표 바코드 (기본단위의 것을 먼저)
        barcodes: {
          where: { isPrimary: 'Y' },
          select: { barcode: true, unitId: true },
        },
        baseUnitId: true,
        shipper: {
          select: { code: true, name: true, ...shipperDefaultsSelect },
        },
        baseUnit: { select: { code: true } },
        // 환산단위 (기본단위 행은 빼고)
        units: {
          where: { level: { not: 'BASE' } },
          select: {
            level: true,
            convQty: true,
            cbm: true,
            widthCm: true,
            depthCm: true,
            heightCm: true,
            grossWeightKg: true,
            unit: { select: { code: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.item.count({ where }),
  ])
  return {
    rows: rows.map(({ shipper, baseUnit, units, barcodes, ...row }) => {
      const options = effectiveItemOptions(
        {
          useLot: row.useLot as 'Y' | 'N' | null,
          useExpiry: row.useExpiry as 'Y' | 'N' | null,
          labelUnit: row.labelUnit,
        },
        shipperItemDefaults(shipper),
      )
      const box = units.find((u) => u.level === 'BOX')
      const plt = units.find((u) => u.level === 'PLT')
      const volumeOk = Boolean(
        box && box.widthCm && box.depthCm && box.heightCm && box.grossWeightKg,
      )
      // PLT 입수(BOX): 팔레트당 박스 수, 없으면 PLT ÷ BOX 환산수량
      const pltBoxQty =
        row.palletBoxQty !== null
          ? String(row.palletBoxQty)
          : box && plt
            ? formatQty(divideQty(plt.convQty.toString(), box.convQty.toString()))
            : null
      return {
        id: row.id,
        systemCode: row.systemCode,
        code: row.code,
        name: row.name,
        spec: row.spec,
        itemType: ITEM_TYPE.labels[row.itemType as ItemTypeKey] ?? row.itemType,
        category1: row.category1,
        barcode:
          (barcodes.find((b) => b.unitId === row.baseUnitId) ?? barcodes[0])?.barcode ?? null,
        shipper: `${shipper.name} (${shipper.code})`,
        baseUnit: baseUnit.code,
        // 환산단위 요약: 'BOX 24 · PLT 1,440'
        units: units.map((u) => `${u.unit.code} ${formatQty(u.convQty)}`).join(' · ') || null,
        boxQty: box ? formatQty(box.convQty) : null,
        pltBoxQty,
        boxCbm: box?.cbm ? formatQty(box.cbm) : null,
        boxWeightKg: box?.grossWeightKg ? formatQty(box.grossWeightKg) : null,
        tempZone: TEMP_ZONE.labels[row.tempZone as TempZoneKey] ?? row.tempZone,
        // 기한 관리: '소비기한' 처럼 종류, 안 하면 null
        expiry: options.useExpiry
          ? (EXPIRY_TYPE.labels[row.expiryType as ExpiryTypeKey] ?? '관리')
          : null,
        shelfLifeDays: row.shelfLifeDays,
        useLot: options.useLot,
        useExpiry: options.useExpiry,
        labelUnit: options.labelUnit,
        // 라벨 단위의 입수량이 없으면 라벨을 발행할 수 없다 (저장은 허용, 목록에 표시 — 사용자 결정)
        labelUnitMissing: !units.some((u) => u.unit.code === options.labelUnit),
        volumeStatus: volumeOk ? 'OK' : 'MISSING',
        expiryAlertDays: row.expiryAlertDays,
        status: row.status,
        source: ITEM_SOURCE.labels[row.source as ItemSourceKey] ?? row.source,
        lastIfAt: row.lastIfAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    }),
    rowCount,
  }
}

// 나누기 (고정 소수점, 소수 6자리에서 버림) — PLT 입수(BOX) 표시용
function divideQty(a: string, b: string) {
  const scale = 10n ** 6n
  return qtyText((parseQty(a) * scale) / parseQty(b))
}
