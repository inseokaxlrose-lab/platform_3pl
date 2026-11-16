import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY } from '@/lib/status'
import { parseQty, qtyText } from '@/lib/units/convert'
import { ASN_SCOPE } from './asns'

// 적치 화면 조회 (docs/decisions/0058) — 서버 액션 밖이라 데이터 범위를 직접 건다

const qty = (value: { toString(): string }) => qtyText(parseQty(value.toString()))
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null

export async function getPutawayWork(asnId: bigint, scope: DataScope) {
  const asn = await prisma.asn.findUnique({
    where: { id: asnId },
    include: {
      center: { select: { code: true, name: true } },
      shipper: { select: { code: true, name: true } },
      receipts: {
        orderBy: { id: 'asc' },
        include: {
          lines: {
            orderBy: { id: 'asc' },
            include: {
              asnLine: {
                select: {
                  lineNo: true,
                  item: {
                    select: {
                      code: true,
                      name: true,
                      baseUnit: { select: { code: true, decimals: true } },
                    },
                  },
                },
              },
              putaways: { orderBy: { id: 'asc' } },
            },
          },
        },
      },
    },
  })
  if (!asn || !isInScope(scope, asn, ASN_SCOPE)) return null

  // 보관 로케이션 (같은 센터의 일반 창고, 사용 중)
  const locations = await prisma.location.findMany({
    where: {
      ...ACTIVE_ONLY,
      warehouse: { centerId: asn.centerId, type: 'GENERAL', delYn: 'N', ...ACTIVE_ONLY },
    },
    select: { id: true, code: true, zone: true, warehouse: { select: { code: true, name: true } } },
    orderBy: [{ warehouse: { code: 'asc' } }, { code: 'asc' }],
  })
  const locationLabel = new Map(locations.map((l) => [l.id, `${l.warehouse.code} / ${l.code}`]))
  const otherIds = asn.receipts
    .flatMap((r) => r.lines.flatMap((l) => l.putaways.map((p) => p.toLocationId)))
    .filter((id) => !locationLabel.has(id))
  if (otherIds.length > 0) {
    const others = await prisma.location.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, code: true, warehouse: { select: { code: true } } },
    })
    for (const l of others) locationLabel.set(l.id, `${l.warehouse.code} / ${l.code}`)
  }

  const receiptLines = asn.receipts.flatMap((r) =>
    r.lines.map((line) => ({
      id: line.id,
      receiptNo: r.receiptNo,
      lineNo: line.asnLine.lineNo,
      item: `${line.asnLine.item.name} (${line.asnLine.item.code})`,
      baseUnit: line.asnLine.item.baseUnit.code,
      decimals: line.asnLine.item.baseUnit.decimals,
      lotNo: line.lotNo,
      expiryOn: day(line.expiryOn),
      qty: qty(line.qty),
      putawayQty: qty(line.putawayQty),
      availableQty: qtyText(parseQty(line.qty.toString()) - parseQty(line.putawayQty.toString())),
    })),
  )
  return textIds({
    id: asn.id,
    asnNo: asn.asnNo,
    status: asn.status,
    putawayStatus: asn.putawayStatus,
    shipper: `${asn.shipper.name} (${asn.shipper.code})`,
    center: `${asn.center.name} (${asn.center.code})`,
    locations: locations.map((l) => ({
      id: l.id,
      label: `${l.warehouse.code} / ${l.code}`,
      description: [l.warehouse.name, l.zone ? `구역 ${l.zone}` : null].filter(Boolean).join(' · '),
    })),
    // 적치할 수 있는 입고확정 줄 (남은 수량 > 0)
    pending: receiptLines.filter((l) => l.availableQty !== '0'),
    // 적치 기록
    history: asn.receipts.flatMap((r) =>
      r.lines.flatMap((line) =>
        line.putaways.map((p) => ({
          id: p.id,
          receiptNo: r.receiptNo,
          lineNo: line.asnLine.lineNo,
          item: `${line.asnLine.item.name} (${line.asnLine.item.code})`,
          lotNo: p.lotNo,
          expiryOn: day(p.expiryOn),
          qty: qty(p.qty),
          baseUnit: line.asnLine.item.baseUnit.code,
          toLocation: locationLabel.get(p.toLocationId) ?? '-',
          createdAt: p.createdAt,
          createdBy: p.createdBy,
        })),
      ),
    ),
  })
}

export type PutawayWork = NonNullable<Awaited<ReturnType<typeof getPutawayWork>>>
