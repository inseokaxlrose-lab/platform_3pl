import 'server-only'
import { EXPORT_LIMIT, toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { idFilter } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { breakdownQty, formatQty, parseQty, qtyText } from '@/lib/units/convert'
import { expiryState, kstToday } from './expiry'

// 재고 조회 (docs/decisions/0060) — 운영사 화면·화주 포털 공용, 서버 액션에서 부른다
// 보기 기준 (조건 키 view):
// - location (기본): 위치별 — 재고 줄 하나(센터·창고·로케이션·화주사·품목·로트·유통기한)
// - item: 소유별 — 화주사 + 품목으로 합계 (여러 로케이션·로트를 더한다), 환산단위로 나눠 보여 준다
// - lot: 로트·유통기한별 — 화주사 + 품목 + 로트 + 유통기한으로 합계, 유통기한 임박·만료 표시
// 수량은 모두 기본단위. 수량 0인 줄은 기본으로 뺀다 (조건 zero=Y면 함께)
// 조건 키: view · keyword · center · warehouse · shipper · expiry(SOON·EXPIRED) · zero

export const STOCK_SCOPE = { center: 'centerId', shipper: 'shipperId' }
export type StockView = 'location' | 'item' | 'lot'

const ITEM_SELECT = {
  id: true,
  code: true,
  name: true,
  spec: true,
  expiryAlertDays: true,
  baseUnit: { select: { code: true } },
  units: { select: { convQty: true, unit: { select: { code: true } } } },
} as const

type ItemInfo = {
  id: bigint
  code: string
  name: string
  spec: string | null
  expiryAlertDays: number | null
  baseUnit: { code: string }
  units: { convQty: { toString(): string }; unit: { code: string } }[]
}

const qty = (value: { toString(): string } | null | undefined) =>
  qtyText(parseQty(value?.toString() ?? '0'))

// 기본단위 수량을 환산단위로 나눠 보여 주기 ('3000' → '2 PLT · 5 BOX'), 환산단위가 없으면 null
function packText(total: string, item: ItemInfo) {
  if (item.units.length === 0 || parseQty(total) <= 0n) return null
  return breakdownQty(
    total,
    item.units.map((u) => ({ unit: u.unit.code, convQty: qty(u.convQty) })),
    item.baseUnit.code,
  )
    .map((part) => `${formatQty(part.qty)} ${part.unit}`)
    .join(' · ')
}

export function parseView(value: string | undefined): StockView {
  return value === 'item' || value === 'lot' ? value : 'location'
}

// 유통기한 조건 → 날짜 조건 (임박은 품목마다 기준이 달라 넉넉히 거른 뒤 행에서 다시 본다)
function expiryWhere(filter: string | undefined, today: string) {
  const todayDate = new Date(`${today}T00:00:00.000Z`)
  if (filter === 'EXPIRED') return { expiryOn: { lt: todayDate } }
  if (filter === 'SOON') return { expiryOn: { gte: todayDate } }
  return {}
}

export async function listStock(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const view = parseView(filters.view)
  const today = kstToday()
  const query = toPrismaQuery(input, {
    searchFields: [
      'item.code',
      'item.name',
      'item.barcode',
      'location.code',
      'lotNo',
      'shipper.name',
    ],
    sortable: {
      center: 'center.code',
      warehouse: 'warehouse.code',
      location: 'location.code',
      shipper: 'shipper.code',
      item: 'item.code',
      lotNo: 'lotNo',
      expiryOn: 'expiryOn',
      qty: 'qty',
      updatedAt: 'updatedAt',
    },
    defaultOrderBy: { updatedAt: 'desc' },
  })
  const where = {
    AND: [
      query.where,
      scopeFilter(scope, STOCK_SCOPE),
      idFilter(filters, 'center') ? { centerId: idFilter(filters, 'center') } : {},
      idFilter(filters, 'warehouse') ? { warehouseId: idFilter(filters, 'warehouse') } : {},
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      filters.zero === 'Y' ? {} : { qty: { gt: 0 } },
      expiryWhere(filters.expiry, today),
    ],
  }
  // 유통기한 임박은 품목마다 기준 일수가 달라 DB 조건으로 못 거른다
  // → 임박 조건이면 (최대 EXPORT_LIMIT건) 읽어서 행에서 거른 뒤 페이지를 나눈다. 만료는 DB 조건으로 정확하다
  const soonOnly = filters.expiry === 'SOON'
  const page = soonOnly ? { skip: 0, take: EXPORT_LIMIT } : { skip: query.skip, take: query.take }
  const finish = <T extends { state: string }>(rows: T[], rowCount: number) => {
    if (!soonOnly) return { rows, rowCount }
    const kept = rows.filter((r) => r.state === 'SOON')
    return { rows: kept.slice(query.skip, query.skip + query.take), rowCount: kept.length }
  }

  if (view === 'location') {
    const [rows, rowCount] = await prisma.$transaction([
      prisma.stock.findMany({
        where,
        orderBy: query.orderBy,
        ...page,
        include: {
          center: { select: { code: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          location: { select: { code: true } },
          shipper: { select: { code: true, name: true } },
          item: { select: ITEM_SELECT },
        },
      }),
      prisma.stock.count({ where }),
    ])
    return finish(
      rows.map((s) => {
        const total = qty(s.qty)
        const allocated = qty(s.allocatedQty)
        const expiry = expiryState(s.expiryOn, s.item.expiryAlertDays, today)
        return {
          id: String(s.id),
          center: `${s.center.name} (${s.center.code})`,
          warehouse: `${s.warehouse.name} (${s.warehouse.code})`,
          location: s.location.code,
          shipper: `${s.shipper.name} (${s.shipper.code})`,
          itemCode: s.item.code,
          itemName: s.item.name,
          spec: s.item.spec,
          lotNo: s.lotNo,
          expiryOn: s.expiryOn?.toISOString().slice(0, 10) ?? null,
          ...expiry,
          baseUnit: s.item.baseUnit.code,
          qty: total,
          allocatedQty: allocated,
          availableQty: qtyText(parseQty(total) - parseQty(allocated)),
          packs: packText(total, s.item),
          locationCount: 1,
          updatedAt: s.updatedAt,
        }
      }),
      rowCount,
    )
  }

  // 합계 보기: 화주사 + 품목 (+ 로트 + 유통기한)
  const by =
    view === 'item'
      ? (['shipperId', 'itemId'] as const)
      : (['shipperId', 'itemId', 'lotNo', 'expiryOn'] as const)
  const groups = await prisma.stock.groupBy({
    by: [...by],
    where,
    _sum: { qty: true, allocatedQty: true },
    _count: { _all: true },
    orderBy: view === 'item' ? [{ itemId: 'asc' }] : [{ itemId: 'asc' }, { expiryOn: 'asc' }],
    ...page,
  })
  const allGroups = await prisma.stock.groupBy({ by: [...by], where })
  const [items, shippers] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: [...new Set(groups.map((g) => g.itemId))] }, delYn: { in: ['Y', 'N'] } },
      select: ITEM_SELECT,
    }),
    prisma.shipper.findMany({
      where: {
        id: { in: [...new Set(groups.map((g) => g.shipperId))] },
        delYn: { in: ['Y', 'N'] },
      },
      select: { id: true, code: true, name: true },
    }),
  ])
  const itemOf = new Map(items.map((i) => [i.id, i]))
  const shipperOf = new Map(shippers.map((s) => [s.id, s]))

  return finish(
    groups.map((g) => {
      const item = itemOf.get(g.itemId)!
      const shipper = shipperOf.get(g.shipperId)!
      const total = qty(g._sum.qty)
      const allocated = qty(g._sum.allocatedQty)
      const lot = 'lotNo' in g ? (g.lotNo as string | null) : null
      const expiryOn = 'expiryOn' in g ? (g.expiryOn as Date | null) : null
      const expiry =
        view === 'lot'
          ? expiryState(expiryOn, item.expiryAlertDays, today)
          : expiryState(null, null, today)
      return {
        id: [g.shipperId, g.itemId, lot ?? '', expiryOn?.toISOString().slice(0, 10) ?? ''].join(
          ':',
        ),
        center: null,
        warehouse: null,
        location: null,
        shipper: `${shipper.name} (${shipper.code})`,
        itemCode: item.code,
        itemName: item.name,
        spec: item.spec,
        lotNo: lot,
        expiryOn: expiryOn?.toISOString().slice(0, 10) ?? null,
        ...expiry,
        baseUnit: item.baseUnit.code,
        qty: total,
        allocatedQty: allocated,
        availableQty: qtyText(parseQty(total) - parseQty(allocated)),
        packs: packText(total, item),
        // 몇 개 로케이션(재고 줄)에 나눠 있는지
        locationCount: g._count._all,
        updatedAt: null,
      }
    }),
    allGroups.length,
  )
}

export type StockRow = Awaited<ReturnType<typeof listStock>>['rows'][number]
