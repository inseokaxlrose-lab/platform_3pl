import 'server-only'
import { resolveUnitDecimals } from '@/lib/units/unit-status'
import { textIds } from '@/lib/id'
import { ASN_SCOPE, itemLotOptions, asnItemSelect } from '@/lib/inbound/asns'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import { parseQty, qtyText } from '@/lib/units/convert'

// 라벨 인쇄 화면 조회 (docs/decisions/0056) — 서버 액션 밖이라 데이터 범위를 직접 건다

const qty = (value: { toString(): string }) => qtyText(parseQty(value.toString()))
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null

// ASN 하나의 검수 기록 + 라벨 현황
export async function getLabelWork(asnId: bigint, scope: DataScope) {
  const asn = await prisma.asn.findUnique({
    where: { id: asnId },
    include: {
      center: { select: { code: true, name: true } },
      shipper: { select: { code: true, name: true } },
      inspections: {
        orderBy: { id: 'asc' },
        include: {
          asnLine: { select: { lineNo: true } },
          item: { select: { ...asnItemSelect(scope.operatorId ?? 0n), name: true } },
          labels: { select: { printCount: true } },
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
    inspections: asn.inspections.map((i) => {
      const labelUnit = itemLotOptions(i.item).labelUnit
      const pack = i.item.units.find((u) => u.unit.code === labelUnit)
      return {
        id: i.id,
        lineNo: i.asnLine.lineNo,
        item: `${i.item.name} (${i.item.code})`,
        lotNo: i.lotNo,
        expiryOn: day(i.expiryOn),
        inspectedQty: qty(i.inspectedQty),
        baseUnit: i.item.baseUnit.code,
        labelUnit,
        // 라벨 단위 입수량 (없으면 라벨을 만들 수 없다)
        labelConvQty: pack ? qty(pack.convQty) : null,
        labelCount: i.labels.length,
        printedCount: i.labels.filter((l) => l.printCount > 0).length,
        inspectedAt: i.inspectedAt,
      }
    }),
  })
}

export type LabelWork = NonNullable<Awaited<ReturnType<typeof getLabelWork>>>

// 인쇄할 라벨 모양 (검수 기록들의 라벨 전부, 검수·순번 차례)
export async function labelViews(inspectionIds: bigint[]) {
  const labels = await prisma.inboundLabel.findMany({
    where: { inspectionId: { in: inspectionIds } },
    orderBy: [{ inspectionId: 'asc' }, { seq: 'asc' }],
    include: {
      inspection: {
        select: {
          lotNo: true,
          expiryOn: true,
          inspectedAt: true,
          item: {
            select: { code: true, name: true, spec: true, baseUnit: { select: { code: true } } },
          },
          asn: {
            select: {
              asnNo: true,
              center: { select: { name: true } },
              shipper: { select: { name: true } },
            },
          },
        },
      },
    },
  })
  return textIds(
    labels.map((l) => ({
      id: l.id,
      labelNo: l.labelNo,
      payload: l.payload,
      seq: l.seq,
      total: l.total,
      labelUnit: l.labelUnit,
      qty: qty(l.qty),
      baseUnit: l.inspection.item.baseUnit.code,
      itemCode: l.inspection.item.code,
      itemName: l.inspection.item.name,
      spec: l.inspection.item.spec,
      lotNo: l.inspection.lotNo,
      expiryOn: day(l.inspection.expiryOn),
      shipperName: l.inspection.asn.shipper.name,
      centerName: l.inspection.asn.center.name,
      asnNo: l.inspection.asn.asnNo,
      inspectedOn: day(l.inspection.inspectedAt) ?? '',
      printCount: l.printCount,
    })),
  )
}
