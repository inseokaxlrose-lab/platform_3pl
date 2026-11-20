import 'server-only'
import { labelOf } from '@/lib/db-value'
import { STOCK_STATUS } from '@/config/operator-codes'
import type { ExportCell, ExportSheet } from '@/components/data-grid/export-rows'
import { EXPORT_LIMIT } from '@/lib/grid/grid-query'
import { ASN_SCOPE } from '@/lib/inbound/asns'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { createDataGridState } from '@/components/data-grid/state'
import { listStock, STOCK_SCOPE } from '@/lib/stock/stock-list'
import { parseQty, qtyText } from '@/lib/units/convert'
import { REPORT_TYPES, type ReportData } from './report-schema'

// 정산·보고용 자료 만들기 (docs/decisions/0064) — 엑셀 한 시트 모양으로 돌려준다 (파일은 화면이 만든다)
// 수량 칸은 엑셀에서 더할 수 있게 숫자로 넣는다 (계산은 BigInt로 하고 마지막에만 숫자로)

// 한국 날짜 기간 → [시작 0시, 끝 다음 날 0시)
const kstStart = (day: string) => new Date(`${day}T00:00:00+09:00`)
const kstEnd = (day: string) => {
  const end = kstStart(day)
  end.setUTCDate(end.getUTCDate() + 1)
  return end
}
const num = (value: bigint): ExportCell => Number(qtyText(value))
const big = (value: { toString(): string } | null | undefined) => parseQty(value?.toString() ?? '0')

export type Report = { fileName: string; sheet: ExportSheet; truncated: boolean }

export async function buildReport(input: ReportData, scope: DataScope): Promise<Report> {
  const label = REPORT_TYPES[input.type].label
  const period = input.from && input.to ? `_${input.from}~${input.to}` : ''
  const fileName = `${label}${period}.xlsx`
  if (input.type === 'RECEIPTS') return { fileName, ...(await receiptsReport(input, scope)) }
  if (input.type === 'MOVEMENT') return { fileName, ...(await movementReport(input, scope)) }
  return { fileName, ...(await stockReport(input, scope)) }
}

// 입고 실적: 기간 안에 확정한 입고확정 줄
async function receiptsReport(input: ReportData, scope: DataScope) {
  const lines = await prisma.inboundReceiptLine.findMany({
    where: {
      receipt: {
        confirmedAt: { gte: kstStart(input.from), lt: kstEnd(input.to) },
        asn: {
          AND: [
            scopeFilter(scope, ASN_SCOPE),
            input.centerId ? { centerId: input.centerId } : {},
            input.shipperId ? { shipperId: input.shipperId } : {},
          ],
        },
      },
    },
    orderBy: [{ receipt: { confirmedAt: 'asc' } }, { id: 'asc' }],
    take: EXPORT_LIMIT + 1,
    include: {
      receipt: {
        select: {
          receiptNo: true,
          confirmedAt: true,
          confirmedBy: true,
          asn: {
            select: {
              asnNo: true,
              shipperRefNo: true,
              center: { select: { code: true, name: true } },
              shipper: { select: { code: true, name: true } },
            },
          },
        },
      },
      asnLine: {
        select: {
          item: { select: { code: true, name: true, baseUnit: { select: { code: true } } } },
        },
      },
    },
  })
  const truncated = lines.length > EXPORT_LIMIT
  const kst = (date: Date) =>
    new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')
  return {
    truncated,
    sheet: {
      header: [
        '확정 일시',
        '확정 번호',
        'ASN 번호',
        '화주사 문서 번호',
        '센터',
        '화주사코드',
        '화주사',
        '품목코드',
        '품목명',
        '로트번호',
        '유통기한',
        '확정 수량',
        '단위',
        '확정자',
      ],
      rows: lines
        .slice(0, EXPORT_LIMIT)
        .map((l) => [
          kst(l.receipt.confirmedAt),
          l.receipt.receiptNo,
          l.receipt.asn.asnNo,
          l.receipt.asn.shipperRefNo,
          l.receipt.asn.center.name,
          l.receipt.asn.shipper.code,
          l.receipt.asn.shipper.name,
          l.asnLine.item.code,
          l.asnLine.item.name,
          l.lotNo,
          l.expiryOn?.toISOString().slice(0, 10) ?? null,
          num(big(l.qty)),
          l.asnLine.item.baseUnit.code,
          l.receipt.confirmedBy,
        ]),
    },
  }
}

// 기간 재고 수불: 화주사·품목별 기초 + 입고 + 조정(+) + 조정(−) = 기말
// 이동(적치 등)은 같은 화주사·품목 안에서 위치만 바뀌어 합계가 0이므로 따로 적지 않는다
// (센터를 고르면 그 센터 안의 수불 — 센터 간 이동은 MVP 이후)
async function movementReport(input: ReportData, scope: DataScope) {
  const base = {
    AND: [
      scopeFilter(scope, STOCK_SCOPE),
      input.centerId ? { centerId: input.centerId } : {},
      input.shipperId ? { shipperId: input.shipperId } : {},
    ],
  }
  const start = kstStart(input.from)
  const end = kstEnd(input.to)
  const [opening, inPeriod] = await Promise.all([
    prisma.stockTxn.groupBy({
      by: ['shipperId', 'itemId'],
      where: { AND: [base, { txnAt: { lt: start } }] },
      _sum: { qtyChange: true },
    }),
    prisma.stockTxn.groupBy({
      by: ['shipperId', 'itemId', 'type'],
      where: {
        AND: [base, { txnAt: { gte: start, lt: end } }, { type: { in: ['RECEIVE', 'ADJUST'] } }],
      },
      _sum: { qtyChange: true },
    }),
  ])
  // 조정은 늘림·줄임을 따로
  const [adjustPlus, adjustMinus] = await Promise.all(
    [{ gt: 0 }, { lt: 0 }].map((qtyChange) =>
      prisma.stockTxn.groupBy({
        by: ['shipperId', 'itemId'],
        where: {
          AND: [base, { txnAt: { gte: start, lt: end } }, { type: 'ADJUST' }, { qtyChange }],
        },
        _sum: { qtyChange: true },
      }),
    ),
  )

  type Acc = { opening: bigint; receive: bigint; plus: bigint; minus: bigint }
  const rows = new Map<string, Acc & { shipperId: bigint; itemId: bigint }>()
  const at = (shipperId: bigint, itemId: bigint) => {
    const key = `${shipperId}:${itemId}`
    if (!rows.has(key))
      rows.set(key, { shipperId, itemId, opening: 0n, receive: 0n, plus: 0n, minus: 0n })
    return rows.get(key)!
  }
  for (const g of opening) at(g.shipperId, g.itemId).opening += big(g._sum.qtyChange)
  for (const g of inPeriod)
    if (g.type === 'RECEIVE') at(g.shipperId, g.itemId).receive += big(g._sum.qtyChange)
  for (const g of adjustPlus) at(g.shipperId, g.itemId).plus += big(g._sum.qtyChange)
  for (const g of adjustMinus) at(g.shipperId, g.itemId).minus += big(g._sum.qtyChange)

  const all = [...rows.values()]
  const [items, shippers] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: all.map((r) => r.itemId) }, delYn: { in: ['Y', 'N'] } },
      select: { id: true, code: true, name: true, baseUnit: { select: { code: true } } },
    }),
    prisma.shipper.findMany({
      where: { id: { in: all.map((r) => r.shipperId) }, delYn: { in: ['Y', 'N'] } },
      select: { id: true, code: true, name: true },
    }),
  ])
  const itemOf = new Map(items.map((i) => [i.id, i]))
  const shipperOf = new Map(shippers.map((s) => [s.id, s]))
  const sorted = all
    .map((r) => ({ ...r, item: itemOf.get(r.itemId)!, shipper: shipperOf.get(r.shipperId)! }))
    .sort((a, b) =>
      a.shipper.code === b.shipper.code
        ? a.item.code.localeCompare(b.item.code)
        : a.shipper.code.localeCompare(b.shipper.code),
    )
  return {
    truncated: false,
    sheet: {
      header: [
        '화주사코드',
        '화주사',
        '품목코드',
        '품목명',
        '단위',
        `기초 재고 (${input.from} 0시)`,
        '입고',
        '조정(+)',
        '조정(−)',
        `기말 재고 (${input.to} 24시)`,
      ],
      rows: sorted.map((r) => [
        r.shipper.code,
        r.shipper.name,
        r.item.code,
        r.item.name,
        r.item.baseUnit.code,
        num(r.opening),
        num(r.receive),
        num(r.plus),
        num(r.minus),
        num(r.opening + r.receive + r.plus + r.minus),
      ]),
    },
  }
}

// 현재 재고: 재고 조회(위치별)와 같은 내용
async function stockReport(input: ReportData, scope: DataScope) {
  const filters: Record<string, string> = {}
  if (input.centerId) filters.center = String(input.centerId)
  if (input.shipperId) filters.shipper = String(input.shipperId)
  const { rows, rowCount } = await listStock(
    { ...createDataGridState(), filters, exportAll: true },
    scope,
  )
  return {
    truncated: rowCount > EXPORT_LIMIT,
    sheet: {
      header: [
        '센터',
        '창고',
        '로케이션',
        '화주사',
        '품목코드',
        '품목명',
        '로트번호',
        '유통기한',
        '재고상태',
        '재고',
        '할당',
        '가용',
        '단위',
        '환산',
      ],
      rows: rows.map((r) => [
        r.center,
        r.warehouse,
        r.location,
        r.shipper,
        r.itemCode,
        r.itemName,
        r.lotNo,
        r.expiryOn,
        labelOf(STOCK_STATUS.labels, r.status),
        num(parseQty(r.qty)),
        num(parseQty(r.allocatedQty)),
        num(parseQty(r.availableQty)),
        r.baseUnit,
        r.packs,
      ]),
    },
  }
}
