import 'server-only'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY } from '@/lib/status'
import { parseQty, qtyText } from '@/lib/units/convert'
import { ASN_SCOPE } from './asns'
import { buildLocationBarcode } from '@/lib/locations/location-barcode'

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
                      baseUnit: {
                        select: { code: true, ...unitDecimalsSelect(scope.operatorId ?? 0n) },
                      },
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
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(asn)
  if (!asn || !isInScope(scope, asn, ASN_SCOPE)) return null

  // 보관 로케이션: 같은 센터의 사용 중인 창고(시스템 기본 창고 제외)·구역·로케이션, 잠기지 않음,
  // 실제 적치 가능 = 로케이션 값, 비어 있으면 창고 값 (0074, 0075 — isLocationUsable 'PUTAWAY'와 같은 조건)
  const locations = await prisma.location.findMany({
    where: {
      ...ACTIVE_ONLY,
      lockYn: 'N',
      warehouse: { centerId: asn.centerId, systemYn: 'N', delYn: 'N', ...ACTIVE_ONLY },
      AND: [
        { OR: [{ inboundYn: 'Y' }, { inboundYn: null, warehouse: { inboundYn: 'Y' } }] },
        { OR: [{ zoneId: null }, { zone: { ...ACTIVE_ONLY, delYn: 'N' } }] },
      ],
    },
    select: {
      id: true,
      code: true,
      zone: { select: { code: true } },
      warehouse: { select: { code: true, name: true } },
    },
    orderBy: [{ warehouse: { sortOrder: 'asc' } }, { warehouse: { code: 'asc' } }, { code: 'asc' }],
  })
  // 표시는 스캔용 바코드 모양 (창고코드.로케이션코드, 0084 ⑤) — 스캐너로 찍으면 검색칸에서 바로 찾아진다
  const locationLabel = new Map(
    locations.map((l) => [l.id, buildLocationBarcode(l.warehouse.code, l.code)]),
  )
  const otherIds = asn.receipts
    .flatMap((r) => r.lines.flatMap((l) => l.putaways.map((p) => p.toLocationId)))
    .filter((id) => !locationLabel.has(id))
  if (otherIds.length > 0) {
    const others = await prisma.location.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, code: true, warehouse: { select: { code: true } } },
    })
    for (const l of others) locationLabel.set(l.id, buildLocationBarcode(l.warehouse.code, l.code))
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
      label: buildLocationBarcode(l.warehouse.code, l.code),
      description: [l.warehouse.name, l.zone ? `구역 ${l.zone.code}` : null]
        .filter(Boolean)
        .join(' · '),
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
