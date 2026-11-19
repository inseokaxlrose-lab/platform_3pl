import 'server-only'
import { shipperDefaultsSelect, shipperItemDefaults } from '@/lib/shippers/shipper-defaults'
import { textIds } from '@/lib/id'
import type { ItemFormOptions } from '@/lib/items/item-form-options'
import type { ItemInput } from '@/lib/items/item-schema'
import { prisma } from '@/lib/prisma'
import {
  isInScope,
  scopeFilter,
  sharedOperatorFilter,
  type DataScope,
} from '@/lib/scope/data-scope'
import { isActiveStatus } from '@/lib/status'
import { isUnitActive, resolveUnitDecimals, unitStatusSelect } from '@/lib/units/unit-status'
import { parseQty, qtyText } from '@/lib/units/convert'
import { isYes } from '@/lib/yn'
import { listPalletTypes } from '@/lib/pallets/pallet-types'
import { ITEM_SCOPE, SHIPPER_SCOPE } from './item-list'
import { SHIPPER_SETUP_ONLY } from '@/lib/shippers/shipper-codes'

// 품목 화면 조회 함수 (docs/decisions/0041) — 운영사 화면·화주 포털 공용. 서버 액션 밖이라 데이터 범위를 직접 건다

// 등록·수정 화면의 선택지: 범위 안의 사용 중인 화주사(품목 기본값 포함) + 단위(종류·소수 자리수)
// 단위는 사용 중지된 것도 넣는다 (이미 저장된 값을 이름으로 보여주기 위해, 새로 고를 때는 화면이 숨긴다)
export async function getItemFormOptions(scope: DataScope): Promise<ItemFormOptions> {
  const operatorId = scope.operatorId ?? 0n
  const [shippers, units, pallets, operator] = await Promise.all([
    prisma.shipper.findMany({
      where: {
        // 품목을 등록할 수 있는 화주사: 준비중·운영중 (0080)
        AND: [scopeFilter(scope, SHIPPER_SCOPE), SHIPPER_SETUP_ONLY],
      },
      select: {
        id: true,
        code: true,
        name: true,
        ...shipperDefaultsSelect,
      },
      orderBy: { code: 'asc' },
    }),
    // 단위: 시스템 기본 단위 + 이 운영사의 추가 단위 (0078)
    prisma.unit.findMany({
      where: sharedOperatorFilter(scope),
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        decimals: true,
        // 실제 사용 여부: 시스템 단위는 이 운영사의 설정 (0079)
        ...unitStatusSelect(scope.operatorId ?? 0n),
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    listPalletTypes(prisma, operatorId),
    prisma.operator.findUnique({ where: { id: operatorId }, select: { defaultPalletType: true } }),
  ])
  // 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(units)
  return textIds({
    shippers: shippers.map(({ id, code, name, ...defaults }) => ({
      id,
      code,
      name,
      ...shipperItemDefaults(defaults),
    })),
    pallets: pallets.map((p) => ({
      code: p.code,
      name: p.name,
      widthCm: p.widthCm,
      depthCm: p.depthCm,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      maxLoadHeightCm: p.maxLoadHeightCm,
      maxLoadWeightKg: p.maxLoadWeightKg,
      isActive: p.status === 'ACTIVE',
    })),
    defaultPalletType: operator?.defaultPalletType ?? 'T11',
    units: units.map(({ status, operatorId, operatorSettings, ...u }) => ({
      ...u,
      isActive: isUnitActive({ status, operatorId, operatorSettings }),
    })),
  })
}

// 수정 화면용 품목 한 건 (범위 밖이면 null → "찾을 수 없음")
export async function getItemForEdit(id: bigint, scope: DataScope) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      shipper: { select: { code: true, name: true, centers: { select: { centerId: true } } } },
      units: { orderBy: { sortOrder: 'asc' }, include: { unit: { select: { code: true } } } },
      barcodes: { orderBy: { id: 'asc' } },
    },
  })
  if (!item || !isInScope(scope, item, ITEM_SCOPE)) return null
  // Decimal → 글자 (끝의 0은 뺀다: 24.000 → '24')
  const qty = (value: { toString(): string } | null) =>
    value === null ? '' : qtyText(parseQty(value.toString()))
  const text = (value: string | null) => value ?? ''
  const input: ItemInput = {
    name: item.name,
    nameEn: text(item.nameEn),
    shortName: text(item.shortName),
    spec: text(item.spec),
    itemType: item.itemType,
    category1: text(item.category1),
    category2: text(item.category2),
    category3: text(item.category3),
    brandName: text(item.brandName),
    makerName: text(item.makerName),
    originCountry: text(item.originCountry),
    hsCode: text(item.hsCode),
    itemValue: qty(item.itemValue),
    currency: text(item.currency),
    baseUnitId: String(item.baseUnitId),
    defaultInboundUnitId:
      item.defaultInboundUnitId === null ? '' : String(item.defaultInboundUnitId),
    defaultOrderUnitId: item.defaultOrderUnitId === null ? '' : String(item.defaultOrderUnitId),
    // PLT 자동 계산 행도 보낸다 (서버가 팔레트 정보로 다시 계산)
    units: item.units.map((u) => ({
      level: u.level,
      unitId: String(u.unitId),
      convQty: qty(u.convQty),
      widthCm: qty(u.widthCm),
      depthCm: qty(u.depthCm),
      heightCm: qty(u.heightCm),
      grossWeightKg: qty(u.grossWeightKg),
      netWeightKg: qty(u.netWeightKg),
    })),
    palletTypeCode: text(item.palletTypeCode),
    palletTi: item.palletTi,
    palletHi: item.palletHi,
    // TI·HI가 있으면 박스 수는 계산값이라 입력 칸은 비운다
    palletBoxQty: item.palletTi && item.palletHi ? null : item.palletBoxQty,
    tempZone: item.tempZone,
    storageTempMin: qty(item.storageTempMin),
    storageTempMax: qty(item.storageTempMax),
    hazmat: isYes(item.hazmatYn),
    fragile: isYes(item.fragileYn),
    maxStackBox: item.maxStackBox,
    upright: isYes(item.uprightYn),
    useExpiry: isYes(item.useExpiry),
    expiryType: text(item.expiryType),
    expiryInput: text(item.expiryInput),
    shelfLifeDays: item.shelfLifeDays,
    minInboundShelfDays: item.minInboundShelfDays,
    minOutboundShelfDays: item.minOutboundShelfDays,
    expiryAlertDays: item.expiryAlertDays,
    useLot: isYes(item.useLot),
    lotSource: text(item.lotSource),
    useSerial: isYes(item.useSerial),
    allocRule: (item.allocRule ?? '') as ItemInput['allocRule'],
    labelUnit: item.labelUnit ?? '',
    boxOnlyShip: isYes(item.boxOnlyShipYn),
    barcodes: item.barcodes.map((b) => ({
      unitId: String(b.unitId),
      barcode: b.barcode,
      barcodeType: b.barcodeType,
      isPrimary: isYes(b.isPrimary),
    })),
    remark: text(item.remark),
  }
  // 재고·미완료 ASN이 있으면 기본단위·관리 여부를 바꿀 수 없다 (화면에서 잠그고 이유 표시)
  const [stock, openAsn] = await Promise.all([
    prisma.stock.count({
      where: { itemId: id, OR: [{ qty: { not: 0 } }, { allocatedQty: { not: 0 } }] },
    }),
    prisma.asnLine.count({
      where: { itemId: id, asn: { status: { in: ['PLANNED', 'INSPECTING', 'PARTIAL'] } } },
    }),
  ])
  return textIds({
    id: item.id,
    code: item.code,
    systemCode: item.systemCode,
    rowVersion: item.rowVersion,
    status: item.status,
    isActive: isActiveStatus(item.status),
    source: item.source,
    lastIfAt: item.lastIfAt,
    shipperId: item.shipperId,
    shipper: `${item.shipper.name} (${item.shipper.code})`,
    structureLock: stock > 0 ? '재고가 있어' : openAsn > 0 ? '미완료 ASN이 있어' : null,
    input,
  })
}

export type ItemForEdit = NonNullable<Awaited<ReturnType<typeof getItemForEdit>>>
