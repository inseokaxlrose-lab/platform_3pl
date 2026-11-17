import 'server-only'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import { parseQty, qtyText } from '@/lib/units/convert'
import { ASN_SCOPE } from './asns'

// 입고 확정 화면 조회 (docs/decisions/0057) — 서버 액션 밖이라 데이터 범위를 직접 건다

const qty = (value: { toString(): string }) => qtyText(parseQty(value.toString()))
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null

export async function getConfirmWork(asnId: bigint, scope: DataScope) {
  const asn = await prisma.asn.findUnique({
    where: { id: asnId },
    include: {
      center: { select: { code: true, name: true } },
      shipper: { select: { code: true, name: true } },
      lines: {
        orderBy: { lineNo: 'asc' },
        select: {
          id: true,
          lineNo: true,
          expectedQty: true,
          confirmedQty: true,
          item: {
            select: {
              code: true,
              name: true,
              baseUnit: { select: { code: true, ...unitDecimalsSelect(scope.operatorId ?? 0n) } },
            },
          },
          inspections: { orderBy: { id: 'asc' } },
        },
      },
      receipts: {
        orderBy: { id: 'desc' },
        include: {
          lines: {
            orderBy: { id: 'asc' },
            include: {
              asnLine: {
                select: {
                  lineNo: true,
                  item: {
                    select: { code: true, name: true, baseUnit: { select: { code: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(asn)
  if (!asn || !isInScope(scope, asn, ASN_SCOPE)) return null

  return textIds({
    id: asn.id,
    asnNo: asn.asnNo,
    status: asn.status,
    shipper: `${asn.shipper.name} (${asn.shipper.code})`,
    center: `${asn.center.name} (${asn.center.code})`,
    // 줄별 예정·누적 확정 (초과 확인용)
    lines: asn.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      expectedQty: qty(l.expectedQty),
      confirmedQty: qty(l.confirmedQty),
    })),
    // 확정할 수 있는 검수 기록 (정상 검수 − 확정 > 0)
    inspections: asn.lines.flatMap((l) =>
      l.inspections
        .map((i) => ({
          id: i.id,
          asnLineId: l.id,
          lineNo: l.lineNo,
          item: `${l.item.name} (${l.item.code})`,
          baseUnit: l.item.baseUnit.code,
          decimals: l.item.baseUnit.decimals,
          lotNo: i.lotNo,
          expiryOn: day(i.expiryOn),
          inspectedQty: qty(i.inspectedQty),
          confirmedQty: qty(i.confirmedQty),
          availableQty: qtyText(
            parseQty(i.inspectedQty.toString()) - parseQty(i.confirmedQty.toString()),
          ),
        }))
        .filter((i) => i.availableQty !== '0'),
    ),
    // 지난 입고확정 (최근 것부터)
    receipts: asn.receipts.flatMap((r) =>
      r.lines.map((line) => ({
        id: line.id,
        receiptNo: r.receiptNo,
        confirmedAt: r.confirmedAt,
        confirmedBy: r.confirmedBy,
        lineNo: line.asnLine.lineNo,
        item: `${line.asnLine.item.name} (${line.asnLine.item.code})`,
        lotNo: line.lotNo,
        expiryOn: day(line.expiryOn),
        qty: qty(line.qty),
        putawayQty: qty(line.putawayQty),
        baseUnit: line.asnLine.item.baseUnit.code,
      })),
    ),
  })
}

export type ConfirmWork = NonNullable<Awaited<ReturnType<typeof getConfirmWork>>>
