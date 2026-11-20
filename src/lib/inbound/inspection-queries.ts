import 'server-only'
import { resolveUnitDecimals } from '@/lib/units/unit-status'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import { parseQty, qtyText } from '@/lib/units/convert'
import { asnItemSelect, ASN_SCOPE, itemLotOptions } from './asns'
import { lineProgress } from './asn-progress'

// 입고 검수 작업 화면 조회 (docs/decisions/0053) — 서버 액션 밖이라 데이터 범위를 직접 건다

const qty = (value: { toString(): string }) => qtyText(parseQty(value.toString()))
const sum = (values: { toString(): string }[]) =>
  qtyText(values.reduce<bigint>((total, v) => total + parseQty(v.toString()), 0n))

export async function getInspectionWork(asnId: bigint, scope: DataScope) {
  const asn = await prisma.asn.findUnique({
    where: { id: asnId },
    include: {
      center: { select: { code: true, name: true } },
      shipper: { select: { code: true, name: true } },
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          item: { select: { ...asnItemSelect(scope.operatorId ?? 0n), name: true } },
          inspections: { orderBy: { id: 'asc' } },
        },
      },
    },
  })
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(asn)
  if (!asn || !isInScope(scope, asn, ASN_SCOPE)) return null

  const lines = asn.lines.map((line) => {
    const options = itemLotOptions(line.item)
    return {
      id: line.id,
      lineNo: line.lineNo,
      itemCode: line.item.code,
      item: `${line.item.name} (${line.item.code})`,
      baseUnit: line.item.baseUnit,
      units: line.item.units.map((u) => ({
        code: u.unit.code,
        convQty: qty(u.convQty),
        decimals: u.unit.decimals,
      })),
      useLot: options.useLot,
      useExpiry: options.useExpiry,
      // 기한 입력 방식·총 기한 일수 (제조일로 유통기한 계산, 0089)
      expiryInput: line.item.expiryInput,
      shelfLifeDays: line.item.shelfLifeDays,
      // 화주사가 알려 준 로트·유통기한·제조일 (검수 입력의 기본값으로)
      plannedLotNo: line.lotNo,
      plannedExpiryOn: line.expiryOn?.toISOString().slice(0, 10) ?? null,
      plannedMfgOn: line.mfgOn?.toISOString().slice(0, 10) ?? null,
      ...lineProgress(line),
      inspectedQty: sum(line.inspections.map((i) => i.inspectedQty)),
      defectQty: sum(line.inspections.map((i) => i.defectQty)),
    }
  })
  const inspections = asn.lines.flatMap((line) =>
    line.inspections.map((i) => ({
      id: i.id,
      lineNo: line.lineNo,
      item: `${line.item.name} (${line.item.code})`,
      baseUnit: line.item.baseUnit.code,
      lotNo: i.lotNo,
      expiryOn: i.expiryOn?.toISOString().slice(0, 10) ?? null,
      inspectedQty: qty(i.inspectedQty),
      defectQty: qty(i.defectQty),
      confirmedQty: qty(i.confirmedQty),
      entry: i.entryUnit && i.entryQty ? `${qty(i.entryQty)} ${i.entryUnit}` : null,
      mfgOn: i.mfgOn?.toISOString().slice(0, 10) ?? null,
      defectReasonCd: i.defectReasonCd,
      remark: i.remark,
      inspectedAt: i.inspectedAt,
      inspectedBy: i.inspectedBy,
    })),
  )
  return textIds({
    id: asn.id,
    asnNo: asn.asnNo,
    status: asn.status,
    expectedOn: asn.expectedOn.toISOString().slice(0, 10),
    shipper: `${asn.shipper.name} (${asn.shipper.code})`,
    center: `${asn.center.name} (${asn.center.code})`,
    shipperRefNo: asn.shipperRefNo,
    lines,
    inspections,
  })
}

export type InspectionWork = NonNullable<Awaited<ReturnType<typeof getInspectionWork>>>
