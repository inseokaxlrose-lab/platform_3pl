import 'server-only'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter, idFilter } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { parseQty, qtyText } from '@/lib/units/convert'
import { STOCK_SCOPE } from './stock-list'
import { labelOf } from '@/lib/db-value'
import { buildLocationBarcode } from '@/lib/locations/location-barcode'

// 재고 이력 조회 (docs/decisions/0062) — 재고가 바뀐 한 번 한 번 (입고·이동(적치)·조정)
// 조건 키: keyword · type(여러 개) · center · shipper · txnAt(기간) · ref(원본 문서 종류)

export const TXN_TYPE_LABELS = {
  RECEIVE: '입고',
  MOVE_OUT: '이동(나감)',
  MOVE_IN: '이동(들어옴)',
  ADJUST: '조정',
} as const

// 원본 문서 종류 이름표
export const REF_TYPE_LABELS: Record<string, string> = {
  RECEIPT: '입고확정',
  PUTAWAY: '적치',
  ADJUSTMENT: '실사·조정',
}

const TYPES = ['RECEIVE', 'MOVE_OUT', 'MOVE_IN', 'ADJUST'] as const
const qty = (value: { toString(): string }) => qtyText(parseQty(value.toString()))

export async function listStockHistory(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: [
      'stock.item.code',
      'stock.item.name',
      'stock.location.code',
      'lotNo',
      'refNo',
      'reason',
      'createdBy',
    ],
    sortable: { txnAt: 'txnAt', type: 'type', qtyChange: 'qtyChange' },
    defaultOrderBy: { id: 'desc' },
  })
  const types = (codesFilter(filters, 'type')?.in ?? []).filter((t): t is (typeof TYPES)[number] =>
    (TYPES as readonly string[]).includes(t),
  )
  const refs = codesFilter(filters, 'ref')?.in ?? []
  const txnAt = dateRangeFilter(filters, 'txnAt')
  const where = {
    AND: [
      query.where,
      scopeFilter(scope, STOCK_SCOPE),
      types.length ? { type: { in: types } } : {},
      refs.length ? { refType: { in: refs } } : {},
      idFilter(filters, 'center') ? { centerId: idFilter(filters, 'center') } : {},
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      txnAt ? { txnAt } : {},
    ],
  }
  const [rows, rowCount] = await prisma.$transaction([
    prisma.stockTxn.findMany({
      ...query,
      where,
      include: {
        stock: {
          select: {
            center: { select: { code: true, name: true } },
            warehouse: { select: { code: true } },
            location: { select: { code: true } },
            shipper: { select: { code: true, name: true } },
            item: { select: { code: true, name: true, baseUnit: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.stockTxn.count({ where }),
  ])
  return {
    rows: rows.map((t) => ({
      id: String(t.id),
      txnAt: t.txnAt,
      type: t.type,
      typeLabel: labelOf(TXN_TYPE_LABELS, t.type),
      center: `${t.stock.center.name} (${t.stock.center.code})`,
      location: buildLocationBarcode(t.stock.warehouse.code, t.stock.location.code),
      shipper: `${t.stock.shipper.name} (${t.stock.shipper.code})`,
      itemCode: t.stock.item.code,
      itemName: t.stock.item.name,
      lotNo: t.lotNo,
      expiryOn: t.expiryOn?.toISOString().slice(0, 10) ?? null,
      baseUnit: t.stock.item.baseUnit.code,
      qtyChange: qty(t.qtyChange),
      qtyAfter: qty(t.qtyAfter),
      ref: t.refType
        ? `${REF_TYPE_LABELS[t.refType] ?? t.refType}${t.refNo ? ` ${t.refNo}` : ''}`
        : null,
      groupId: t.groupId ? String(t.groupId) : null,
      reason: t.reason,
      createdBy: t.createdBy,
    })),
    rowCount,
  }
}
