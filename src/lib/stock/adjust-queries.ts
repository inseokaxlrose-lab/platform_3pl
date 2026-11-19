import 'server-only'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter, idFilter } from '@/lib/grid/list-filters'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { parseQty, qtyText } from '@/lib/units/convert'
import { ADJUST_SCOPE } from './adjusts'

// 재고 실사·조정 조회 (docs/decisions/0061)

const qty = (value: { toString(): string } | null) =>
  value === null ? null : qtyText(parseQty(value.toString()))

// 목록 (서버 액션에서): 조건 키 keyword · center · type · status · createdAt
export async function listAdjusts(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: ['adjustNo', 'reason', 'createdBy'],
    sortable: { adjustNo: 'adjustNo', createdAt: 'createdAt', status: 'status', type: 'type' },
    defaultOrderBy: { createdAt: 'desc' },
  })
  const types = (codesFilter(filters, 'type')?.in ?? []).filter(
    (t) => t === 'COUNT' || t === 'ADJUST',
  )
  const statuses = (codesFilter(filters, 'status')?.in ?? []).filter((t) =>
    ['DRAFT', 'CONFIRMED', 'CANCELED'].includes(t),
  ) as ('DRAFT' | 'CONFIRMED' | 'CANCELED')[]
  const createdAt = dateRangeFilter(filters, 'createdAt')
  const where = {
    AND: [
      query.where,
      scopeFilter(scope, ADJUST_SCOPE),
      idFilter(filters, 'center') ? { centerId: idFilter(filters, 'center') } : {},
      types.length ? { type: { in: types as ('COUNT' | 'ADJUST')[] } } : {},
      statuses.length ? { status: { in: statuses } } : {},
      createdAt ? { createdAt } : {},
    ],
  }
  const [rows, rowCount] = await prisma.$transaction([
    prisma.stockAdjust.findMany({
      ...query,
      where,
      select: {
        id: true,
        adjustNo: true,
        type: true,
        status: true,
        centerId: true,
        reason: true,
        createdAt: true,
        createdBy: true,
        confirmedAt: true,
        confirmedBy: true,
        _count: { select: { lines: true } },
      },
    }),
    prisma.stockAdjust.count({ where }),
  ])
  const centers = await prisma.center.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.centerId))] }, delYn: { in: ['Y', 'N'] } },
    select: { id: true, code: true, name: true },
  })
  const centerOf = new Map(centers.map((c) => [c.id, `${c.name} (${c.code})`]))
  return {
    rows: rows.map(({ _count, centerId, ...row }) => ({
      ...row,
      id: String(row.id),
      center: centerOf.get(centerId) ?? '-',
      lineCount: _count.lines,
    })),
    rowCount,
  }
}

// 상세 (화면 조회)
export async function getAdjustDetail(id: bigint, scope: DataScope) {
  if (scope.kind === 'SHIPPER') return null
  const adjust = await prisma.stockAdjust.findUnique({
    where: { id },
    include: {
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          stock: {
            select: {
              qty: true,
              lotNo: true,
              expiryOn: true,
              location: { select: { code: true, warehouse: { select: { code: true } } } },
              shipper: { select: { name: true } },
              item: { select: { code: true, name: true, baseUnit: { select: { code: true } } } },
            },
          },
        },
      },
    },
  })
  if (!adjust || !isInScope(scope, adjust, ADJUST_SCOPE)) return null
  const center = await prisma.center.findUnique({
    where: { id: adjust.centerId },
    select: { code: true, name: true },
  })
  return textIds({
    id: adjust.id,
    adjustNo: adjust.adjustNo,
    type: adjust.type,
    status: adjust.status,
    center: center ? `${center.name} (${center.code})` : '-',
    reason: adjust.reason,
    remark: adjust.remark,
    createdAt: adjust.createdAt,
    createdBy: adjust.createdBy,
    confirmedAt: adjust.confirmedAt,
    confirmedBy: adjust.confirmedBy,
    canceledAt: adjust.canceledAt,
    canceledBy: adjust.canceledBy,
    lines: adjust.lines.map((line) => {
      const current = qty(line.stock.qty)!
      // 등록 상태에서 미리 보는 차이: 실사는 센 수량 − 지금 재고
      const preview =
        adjust.type === 'COUNT'
          ? qtyText(parseQty(line.countedQty!.toString()) - parseQty(current))
          : qty(line.changeQty)!
      return {
        id: line.id,
        lineNo: line.lineNo,
        location: `${line.stock.location.warehouse.code} / ${line.stock.location.code}`,
        shipper: line.stock.shipper.name,
        item: `${line.stock.item.name} (${line.stock.item.code})`,
        lotNo: line.stock.lotNo,
        expiryOn: line.stock.expiryOn?.toISOString().slice(0, 10) ?? null,
        baseUnit: line.stock.item.baseUnit.code,
        systemQty: qty(line.systemQty)!,
        currentQty: current,
        countedQty: qty(line.countedQty),
        changeQty: preview,
        appliedQty: qty(line.appliedQty),
      }
    }),
  })
}

export type AdjustDetail = NonNullable<Awaited<ReturnType<typeof getAdjustDetail>>>

// 등록 화면에서 고를 재고 줄 (센터의 재고, 수량 0인 줄 포함 — 실사로 다시 찾은 것을 넣을 수 있게)
export async function getAdjustStockOptions(centerId: bigint, scope: DataScope) {
  if (scope.kind === 'SHIPPER') return []
  if (scope.kind === 'CENTERS' && !scope.centerIds.includes(centerId)) return []
  const stocks = await prisma.stock.findMany({
    where: { centerId },
    orderBy: [{ location: { code: 'asc' } }, { item: { code: 'asc' } }],
    take: 3000,
    select: {
      id: true,
      qty: true,
      lotNo: true,
      expiryOn: true,
      location: { select: { code: true, warehouse: { select: { code: true } } } },
      shipper: { select: { name: true } },
      item: {
        select: {
          code: true,
          name: true,
          barcodes: { select: { barcode: true } },
          baseUnit: { select: { code: true, ...unitDecimalsSelect(scope.operatorId ?? 0n) } },
        },
      },
    },
  })
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(stocks)
  return textIds(
    stocks.map((s) => ({
      id: s.id,
      label: `${s.location.warehouse.code} / ${s.location.code} · ${s.item.code}`,
      description: [
        s.item.name,
        s.shipper.name,
        s.lotNo ? `로트 ${s.lotNo}` : null,
        s.expiryOn ? `유통 ${s.expiryOn.toISOString().slice(0, 10)}` : null,
        `재고 ${qty(s.qty)} ${s.item.baseUnit.code}`,
      ]
        .filter(Boolean)
        .join(' · '),
      keywords: [s.item.name, ...s.item.barcodes.map((b) => b.barcode), s.lotNo]
        .filter(Boolean)
        .join(' '),
      qty: qty(s.qty)!,
      baseUnit: s.item.baseUnit.code,
      decimals: s.item.baseUnit.decimals,
    })),
  )
}

export type AdjustStockOption = Awaited<ReturnType<typeof getAdjustStockOptions>>[number]
