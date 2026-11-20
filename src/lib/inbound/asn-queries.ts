import 'server-only'
import { shipperDefaultsSelect, shipperItemDefaults } from '@/lib/shippers/shipper-defaults'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import { textIds } from '@/lib/id'
import { effectiveItemOptions } from '@/lib/items/item-schema'
import { prisma } from '@/lib/prisma'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY } from '@/lib/status'
import { qtyText, parseQty } from '@/lib/units/convert'
import type { AsnFormOptions, AsnItemOption } from './asn-options'
import { lineProgress } from './asn-progress'
import type { AsnInput } from './asn-schema'
import { ASN_SCOPE } from './asns'

// ASN 화면 조회 함수 (docs/decisions/0048) — 운영사 화면·화주 포털 공용. 서버 액션 밖이라 데이터 범위를 직접 건다

const CENTER_SCOPE = { center: 'id', shipper: 'shippers.some.shipperId' }
const SHIPPER_SCOPE = { center: 'centers.some.centerId', shipper: 'id' }

// DB Decimal → 끝의 0을 뺀 글자 ('24.000' → '24')
const qty = (value: { toString(): string }) => qtyText(parseQty(value.toString()))
const dateText = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : '')

// 등록·수정 화면의 선택지: 범위 안의 사용 중인 센터 + 화주사(이용 센터 중 범위 안의 것)
export async function getAsnFormOptions(scope: DataScope): Promise<AsnFormOptions> {
  const [centers, shippers] = await Promise.all([
    prisma.center.findMany({
      where: { AND: [scopeFilter(scope, CENTER_SCOPE), ACTIVE_ONLY] },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.shipper.findMany({
      where: { AND: [scopeFilter(scope, SHIPPER_SCOPE), ACTIVE_ONLY] },
      select: { id: true, code: true, name: true, centers: { select: { centerId: true } } },
      orderBy: { code: 'asc' },
    }),
  ])
  const allowed = new Set(centers.map((c) => c.id))
  return textIds({
    centers,
    shippers: shippers.map(({ centers: used, ...s }) => ({
      ...s,
      centerIds: used.map((u) => u.centerId).filter((id) => allowed.has(id)),
    })),
  })
}

// 화주사의 사용 중인 품목 (ASN 라인에서 고를 것). 화주사가 범위 밖이면 빈 목록
export async function getAsnItemOptions(
  shipperId: bigint,
  scope: DataScope,
): Promise<AsnItemOption[]> {
  const shipper = await prisma.shipper.findFirst({
    where: { AND: [{ id: shipperId }, scopeFilter(scope, SHIPPER_SCOPE)] },
    select: shipperDefaultsSelect,
  })
  if (!shipper) return []
  const items = await prisma.item.findMany({
    where: { shipperId, ...ACTIVE_ONLY },
    select: {
      id: true,
      code: true,
      name: true,
      spec: true,
      // 대표 바코드 (스캔·검색용, 0083 — 기본단위 것을 먼저)
      barcodes: {
        where: { isPrimary: 'Y' },
        select: { barcode: true, unit: { select: { code: true } } },
      },
      useLot: true,
      useExpiry: true,
      labelUnit: true,
      baseUnit: { select: { code: true, ...unitDecimalsSelect(scope.operatorId ?? 0n) } },
      // 환산단위 (기본단위 행은 빼고, 0083)
      units: {
        where: { level: { not: 'BASE' } },
        select: {
          convQty: true,
          unit: { select: { code: true, ...unitDecimalsSelect(scope.operatorId ?? 0n) } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  })
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(items)
  const defaults = shipperItemDefaults(shipper)
  return textIds(
    items.map(({ units, useLot, useExpiry, labelUnit, barcodes, ...item }) => {
      const options = effectiveItemOptions(
        { useLot: useLot as 'Y' | 'N' | null, useExpiry: useExpiry as 'Y' | 'N' | null, labelUnit },
        defaults,
      )
      return {
        ...item,
        barcode:
          (barcodes.find((b) => b.unit.code === item.baseUnit.code) ?? barcodes[0])?.barcode ??
          null,
        units: units.map((u) => ({
          code: u.unit.code,
          convQty: qty(u.convQty),
          decimals: u.unit.decimals,
        })),
        useLot: options.useLot,
        useExpiry: options.useExpiry,
      }
    }),
  )
}

// 수정·조회 화면용 ASN 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getAsnForEdit(id: bigint, scope: DataScope) {
  const asn = await prisma.asn.findUnique({
    where: { id },
    include: {
      center: { select: { code: true, name: true } },
      shipper: { select: { code: true, name: true } },
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          item: { select: { code: true, name: true, baseUnit: { select: { code: true } } } },
        },
      },
    },
  })
  if (!asn || !isInScope(scope, asn, ASN_SCOPE)) return null

  const input: AsnInput = {
    centerId: String(asn.centerId),
    expectedOn: dateText(asn.expectedOn),
    shipperRefNo: asn.shipperRefNo ?? '',
    remark: asn.remark ?? '',
    lines: asn.lines.map((line) => ({
      itemId: String(line.itemId),
      unit: line.entryUnit ?? line.item.baseUnit.code,
      qty: line.entryQty ? qty(line.entryQty) : qty(line.expectedQty),
      lotNo: line.lotNo ?? '',
      expiryOn: dateText(line.expiryOn),
      remark: line.remark ?? '',
    })),
  }
  return textIds({
    id: asn.id,
    asnNo: asn.asnNo,
    rowVersion: asn.rowVersion,
    status: asn.status,
    putawayStatus: asn.putawayStatus,
    channel: asn.channel,
    type: asn.type,
    shipperId: asn.shipperId,
    shipper: `${asn.shipper.name} (${asn.shipper.code})`,
    center: `${asn.center.name} (${asn.center.code})`,
    closeReasonCd: asn.closeReasonCd,
    closeReason: asn.closeReason,
    closedAt: asn.closedAt,
    closedBy: asn.closedBy,
    createdBy: asn.createdBy,
    createdAt: asn.createdAt,
    input,
    // 라인별 진행 (조회용, 기본단위)
    progress: asn.lines.map((line) => ({
      lineNo: line.lineNo,
      item: `${line.item.name} (${line.item.code})`,
      baseUnit: line.item.baseUnit.code,
      lotNo: line.lotNo,
      ...lineProgress(line),
    })),
  })
}

export type AsnForEdit = NonNullable<Awaited<ReturnType<typeof getAsnForEdit>>>
