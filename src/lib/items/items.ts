import 'server-only'
import { Prisma, type AsnStatus } from '@/generated/prisma/client'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { deleteExternalCodes } from '@/lib/master-code/external-codes'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { getPalletSpec } from '@/lib/pallets/pallet-types'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { isShipperSetupStatus } from '@/lib/shippers/shipper-codes'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, toStatus } from '@/lib/status'
import { checkQtyDecimals, parseQty } from '@/lib/units/convert'
import { isItemBaseType } from '@/lib/units/unit-labels'
import { isUnitActive, resolveUnitDecimals, unitStatusSelect } from '@/lib/units/unit-status'
import { toYn } from '@/lib/yn'
import {
  calcPallet,
  cbmOf,
  checkBarcode,
  checkUnitLadder,
  densityWarning,
  palletBoxQty,
  stackWarning,
  type ItemWarning,
} from './item-calc'
import { UNIT_LEVEL_ORDER, type BarcodeType, type UnitLevel } from './item-codes'
import type { ItemCreateData, ItemData } from './item-schema'

// 품목 저장 (docs/decisions/0041, 0083). 권한·데이터 범위 검사는 서버 액션에서 한다
// - 화주사·품목코드는 등록 후 바꿀 수 없다 (품목코드는 화주 코드 = API 업무 키)
// - 단위는 레벨별 1행(BASE 필수). 체적은 BOX 기준, PLT는 팔레트 적재 정보(종류·TI·HI·박스 수)가 있으면 계산, 없으면 입력값
// - 기본단위·기한/LOT/시리얼 관리 여부는 재고·미완료 ASN이 있으면 바꿀 수 없다 (재고 구조가 바뀐다)
// - 환산수량을 바꾸면 이력을 남기고, 그 단위로 된 미완료 ASN이 있으면 막는다
// - 저장은 되지만 알려 줄 것(체적 이상·팔레트 높이 초과 등)은 경고(warnings)로 돌려준다
// - 저장 본체(…In)는 트랜잭션(tx)을 받는다 (API dry-run이 같은 로직을 되돌릴 수 있게)

export type ItemSaveOptions = {
  source?: 'SCREEN' | 'PORTAL' | 'API' | 'UPLOAD'
  requestId?: string
}

// 미완료 ASN (예정·검수중·부분확정)
const OPEN_ASN = {
  asn: { status: { in: ['PLANNED', 'INSPECTING', 'PARTIAL'] as AsnStatus[] } },
} satisfies Prisma.AsnLineWhereInput

// 품목코드: 같은 화주사 안에서 중복 금지 (지운 것은 다시 쓸 수 있다)
async function assertItemCode(db: Db, shipperId: bigint, code: string) {
  const owner = await db.item.findFirst({ where: { shipperId, code }, select: { id: true } })
  if (owner) throw new ActionError('CONFLICT', `이 화주사에 이미 있는 품목코드입니다: ${code}`)
}

type UnitInfo = { id: bigint; code: string; type: string; decimals: number }

// 단위 검사: 기본단위는 포장이 아닌 단위, 나머지 레벨은 포장 단위(PACK), 새로 고르는 단위는 사용 중이어야 한다 (0078)
// 환산수량 소수 자리는 기본단위의 소수 자리수까지 (EA면 정수만), 레벨 순서대로 커져야 한다
async function checkUnits(db: Db, data: ItemData, keep: bigint[]) {
  const ids = [...new Set([data.baseUnitId, ...data.units.map((u) => u.unitId)])]
  const units = await db.unit.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      code: true,
      type: true,
      decimals: true,
      ...unitStatusSelect(requireOperatorId()),
    },
  })
  resolveUnitDecimals(units)
  const byId = new Map<bigint, UnitInfo & { usable: boolean }>(
    units.map((u) => [u.id, { ...u, usable: isUnitActive(u) || keep.includes(u.id) }]),
  )
  const base = byId.get(data.baseUnitId)
  if (!base?.usable || !isItemBaseType(base.type)) {
    throw new ActionError(
      'VALIDATION',
      '기본단위는 사용 중인 수량·중량·부피·길이·면적 단위 중에서 골라 주세요.',
    )
  }
  for (const row of data.units) {
    if (row.level === 'BASE') continue
    const unit = byId.get(row.unitId)
    if (!unit?.usable || unit.type !== 'PACK') {
      throw new ActionError(
        'VALIDATION',
        `${row.level} 단위는 사용 중인 포장 단위 중에서 골라 주세요.`,
      )
    }
    if (!checkQtyDecimals(row.convQty, base.decimals)) {
      throw new ActionError(
        'VALIDATION',
        base.decimals === 0
          ? `${unit.code} 환산수량은 정수로 입력해 주세요. (기본단위 ${base.code})`
          : `${unit.code} 환산수량은 소수 ${base.decimals}자리까지입니다. (기본단위 ${base.code})`,
      )
    }
  }
  return { base, byId }
}

// PLT 단위 (시스템 기본 단위 'PLT')
async function pltUnitId(db: Db) {
  const unit = await db.unit.findFirst({
    where: { code: 'PLT', operatorId: null },
    select: { id: true },
  })
  if (!unit) throw new ActionError('NOT_FOUND', 'PLT 단위가 없습니다. (시스템 기본 단위)')
  return unit.id
}

type UnitRow = {
  level: UnitLevel
  unitId: bigint
  unitCode: string
  convQty: string
  widthCm: string | null
  depthCm: string | null
  heightCm: string | null
  cbm: string | null
  grossWeightKg: string | null
  netWeightKg: string | null
  autoCalc: boolean
}

// 저장할 단위 행 + 경고: CBM 계산, PLT 행은 팔레트 적재 정보가 있으면 계산(보낸 PLT는 무시하고 경고)
async function buildUnits(db: Db, data: ItemData, byId: Map<bigint, UnitInfo>) {
  const warnings: ItemWarning[] = []
  const rows: UnitRow[] = data.units.map((u) => ({
    level: u.level as UnitLevel,
    unitId: u.unitId,
    unitCode: byId.get(u.unitId)?.code ?? '',
    convQty: u.level === 'BASE' ? '1' : u.convQty,
    widthCm: u.widthCm,
    depthCm: u.depthCm,
    heightCm: u.heightCm,
    cbm: cbmOf(u.widthCm, u.depthCm, u.heightCm),
    grossWeightKg: u.grossWeightKg,
    netWeightKg: u.netWeightKg,
    autoCalc: false,
  }))
  const pallet = { ti: data.palletTi, hi: data.palletHi, boxQty: data.palletBoxQty }
  if (palletBoxQty(pallet)) {
    const box = rows.find((r) => r.level === 'BOX')
    if (!box) throw new ActionError('VALIDATION', '팔레트 적재를 계산하려면 BOX 단위가 필요합니다.')
    const spec = await getPalletSpec(db, requireOperatorId(), data.palletTypeCode)
    if (data.palletTypeCode && !spec) {
      throw new ActionError('VALIDATION', `없는 팔레트 종류입니다: ${data.palletTypeCode}`)
    }
    const calc = calcPallet(box, spec, pallet)!
    const sent = rows.findIndex((r) => r.level === 'PLT')
    if (sent >= 0 && rows[sent].convQty !== calc.convQty) {
      warnings.push({
        code: 'PLT_RECALCULATED',
        level: 'PLT',
        message: `PLT는 팔레트 적재 정보로 계산합니다 (보낸 ${rows[sent].convQty} → ${calc.convQty}).`,
      })
    }
    const plt: UnitRow = {
      level: 'PLT',
      unitId: sent >= 0 ? rows[sent].unitId : await pltUnitId(db),
      unitCode: sent >= 0 ? rows[sent].unitCode : 'PLT',
      convQty: calc.convQty,
      widthCm: calc.widthCm,
      depthCm: calc.depthCm,
      heightCm: calc.heightCm,
      cbm: calc.cbm,
      grossWeightKg: calc.grossWeightKg,
      netWeightKg: null,
      autoCalc: true,
    }
    if (sent >= 0) rows[sent] = plt
    else rows.push(plt)
    warnings.push(...calc.warnings)
  }
  rows.sort((a, b) => UNIT_LEVEL_ORDER[a.level] - UNIT_LEVEL_ORDER[b.level])
  const ladder = checkUnitLadder(
    rows.map((r) => ({ level: r.level, unitCode: r.unitCode, convQty: r.convQty })),
  )
  if (ladder.errors.length > 0) throw new ActionError('VALIDATION', ladder.errors[0])
  warnings.push(...ladder.warnings)
  for (const r of rows) {
    if (r.autoCalc) continue
    const density = densityWarning(r.level, r.cbm, r.grossWeightKg)
    if (density) warnings.push(density)
  }
  const box = rows.find((r) => r.level === 'BOX')
  if (!box || !box.widthCm || !box.depthCm || !box.heightCm || !box.grossWeightKg) {
    warnings.push({
      code: 'VOLUME_MISSING',
      level: 'BOX',
      message: 'BOX 규격(가로·세로·높이·총중량)이 없어 체적 미등록입니다.',
    })
  }
  const stack = stackWarning(data.maxStackBox, data.palletHi)
  if (stack) warnings.push(stack)
  return { rows, warnings }
}

// 바코드 검사: 체크디지트, 같은 화주사의 다른 품목과 겹침 금지. 단위별 대표가 없으면 첫 바코드를 대표로
async function buildBarcodes(db: Db, shipperId: bigint, itemId: bigint | null, data: ItemData) {
  for (const b of data.barcodes) {
    const problem = checkBarcode(b.barcodeType as BarcodeType, b.barcode)
    if (problem) throw new ActionError('VALIDATION', `바코드 ${b.barcode}: ${problem}`)
  }
  if (data.barcodes.length > 0) {
    const taken = await db.itemBarcode.findFirst({
      where: {
        shipperId,
        barcode: { in: data.barcodes.map((b) => b.barcode) },
        ...(itemId !== null && { itemId: { not: itemId } }),
        item: NOT_DELETED,
      },
      select: { barcode: true, item: { select: { code: true } } },
    })
    if (taken) {
      throw new ActionError(
        'CONFLICT',
        `이 화주사의 다른 품목(${taken.item.code})이 쓰는 바코드입니다: ${taken.barcode}`,
      )
    }
  }
  const primaryUnits = new Set(data.barcodes.filter((b) => b.isPrimary).map((b) => b.unitId))
  return data.barcodes.map((b) => {
    const primary = b.isPrimary || !primaryUnits.has(b.unitId)
    if (primary) primaryUnits.add(b.unitId)
    return { ...b, isPrimary: primary }
  })
}

// DB 칸으로 옮길 값
function fieldsOf(data: ItemData, units: UnitRow[]) {
  const unitIds = new Set(units.map((u) => u.unitId))
  if (data.defaultInboundUnitId !== null && !unitIds.has(data.defaultInboundUnitId)) {
    throw new ActionError('VALIDATION', '기본 입고단위는 이 품목의 단위 중에서 골라 주세요.')
  }
  if (data.defaultOrderUnitId !== null && !unitIds.has(data.defaultOrderUnitId)) {
    throw new ActionError('VALIDATION', '기본 주문단위는 이 품목의 단위 중에서 골라 주세요.')
  }
  return {
    name: data.name,
    nameEn: data.nameEn,
    shortName: data.shortName,
    spec: data.spec,
    itemType: data.itemType,
    setYn: toYn(data.itemType === 'SET'),
    category1: data.category1,
    category2: data.category2,
    category3: data.category3,
    brandName: data.brandName,
    makerName: data.makerName,
    originCountry: data.originCountry,
    hsCode: data.hsCode,
    itemValue: data.itemValue,
    currency: data.currency,
    baseUnitId: data.baseUnitId,
    // NULL = 자동 (입고 = BOX, 없으면 기본단위 / 주문 = 기본단위) — 실제 값은 loadItemUoms (item-convert.ts)
    defaultInboundUnitId: data.defaultInboundUnitId,
    defaultOrderUnitId: data.defaultOrderUnitId,
    palletTypeCode: data.palletTypeCode,
    palletTi: data.palletTi,
    palletHi: data.palletHi,
    palletBoxQty: palletBoxQty({ ti: data.palletTi, hi: data.palletHi, boxQty: data.palletBoxQty }),
    tempZone: data.tempZone,
    storageTempMin: data.storageTempMin,
    storageTempMax: data.storageTempMax,
    hazmatYn: toYn(data.hazmat),
    fragileYn: toYn(data.fragile),
    maxStackBox: data.maxStackBox,
    uprightYn: toYn(data.upright),
    useExpiry: toYn(data.useExpiry),
    // 기한을 관리하지 않으면 기한 칸은 비운다
    expiryType: data.useExpiry ? data.expiryType : null,
    expiryInput: data.useExpiry ? data.expiryInput : null,
    shelfLifeDays: data.useExpiry ? data.shelfLifeDays : null,
    minInboundShelfDays: data.useExpiry ? data.minInboundShelfDays : null,
    minOutboundShelfDays: data.useExpiry ? data.minOutboundShelfDays : null,
    expiryAlertDays: data.useExpiry ? data.expiryAlertDays : null,
    useLot: toYn(data.useLot),
    lotSource: data.useLot ? data.lotSource : null,
    useSerial: toYn(data.useSerial),
    allocRule: data.allocRule || null,
    labelUnit: data.labelUnit || null,
    boxOnlyShipYn: toYn(data.boxOnlyShip),
    remark: data.remark,
  }
}

const decimal = (value: string | null) => (value === null ? null : new Prisma.Decimal(value))

// 단위·바코드 행 다시 쓰기 (품목의 이력으로 본다 — 환산수량 변경은 tb_item_unit_hist)
async function writeChildren(
  db: Db,
  item: { id: bigint; shipperId: bigint },
  units: UnitRow[],
  barcodes: Awaited<ReturnType<typeof buildBarcodes>>,
) {
  await db.itemUnit.deleteMany({ where: { itemId: item.id } })
  for (const [index, u] of units.entries()) {
    await db.itemUnit.create({
      data: {
        itemId: item.id,
        unitId: u.unitId,
        level: u.level,
        convQty: new Prisma.Decimal(u.convQty),
        widthCm: decimal(u.widthCm),
        depthCm: decimal(u.depthCm),
        heightCm: decimal(u.heightCm),
        cbm: decimal(u.cbm),
        grossWeightKg: decimal(u.grossWeightKg),
        netWeightKg: decimal(u.netWeightKg),
        autoCalcYn: toYn(u.autoCalc),
        sortOrder: index,
      },
    })
  }
  await db.itemBarcode.deleteMany({ where: { itemId: item.id } })
  for (const b of barcodes) {
    await db.itemBarcode.create({
      data: {
        operatorId: requireOperatorId(),
        shipperId: item.shipperId,
        itemId: item.id,
        unitId: b.unitId,
        barcode: b.barcode,
        barcodeType: b.barcodeType,
        isPrimary: toYn(b.isPrimary),
      },
    })
  }
}

// 경고 → 저장 알림 문구
const warningNotice = (warnings: ItemWarning[]) =>
  warnings.length > 0 ? `확인할 것: ${warnings.map((w) => w.message).join(' / ')}` : undefined

// 등록 본체 (트랜잭션 안)
export async function createItemIn(db: Db, data: ItemCreateData, options: ItemSaveOptions = {}) {
  const shipper = await db.shipper.findUnique({
    where: { id: data.shipperId },
    select: { status: true },
  })
  if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
  if (!isShipperSetupStatus(shipper.status)) {
    throw new ActionError('CONFLICT', '준비중·운영중인 화주사에만 품목을 등록할 수 있습니다.')
  }
  await assertItemCode(db, data.shipperId, data.code)
  const { byId } = await checkUnits(db, data, [])
  const { rows, warnings } = await buildUnits(db, data, byId)
  const barcodes = await buildBarcodes(db, data.shipperId, null, data)
  const item = await db.item.create({
    data: {
      ...fieldsOf(data, rows),
      operatorId: requireOperatorId(),
      shipperId: data.shipperId,
      systemCode: await nextSystemCode('ITEM', db),
      code: data.code,
      source: options.source ?? 'SCREEN',
      ...(options.requestId && { lastIfAt: new Date(), lastRequestId: options.requestId }),
    },
    select: { id: true, systemCode: true, code: true, rowVersion: true, shipperId: true },
  })
  await writeChildren(db, item, rows, barcodes)
  return {
    id: item.id,
    systemCode: item.systemCode,
    code: item.code,
    rowVersion: item.rowVersion,
    warnings,
    notice: warningNotice(warnings),
  }
}

// 재고·미완료 ASN이 있는지 (관리 방식·기본단위 변경을 막는다)
async function hasStockOrOpenDoc(db: Db, itemId: bigint) {
  const [stock, asn] = await Promise.all([
    db.stock.count({ where: { itemId, OR: [{ qty: { not: 0 } }, { allocatedQty: { not: 0 } }] } }),
    db.asnLine.count({ where: { itemId, ...OPEN_ASN } }),
  ])
  return { stock: stock > 0, asn: asn > 0 }
}

// 수정 본체 (트랜잭션 안): 화주사·품목코드·시스템 코드는 바뀌지 않는다
export async function updateItemIn(
  db: Db,
  id: bigint,
  rowVersion: number,
  data: ItemData,
  options: ItemSaveOptions = {},
) {
  const found = await db.item.findUnique({
    where: { id },
    select: {
      rowVersion: true,
      shipperId: true,
      code: true,
      baseUnitId: true,
      useLot: true,
      useExpiry: true,
      useSerial: true,
      units: {
        select: { unitId: true, level: true, convQty: true, unit: { select: { code: true } } },
      },
    },
  })
  assertRowVersion(found, rowVersion, '품목을 찾을 수 없습니다.')
  const current = found!
  // 재고 구조를 바꾸는 변경: 재고·미완료 ASN이 있으면 막는다 (ITEM_STOCK_EXISTS)
  const structural =
    current.baseUnitId !== data.baseUnitId ||
    current.useLot !== toYn(data.useLot) ||
    current.useExpiry !== toYn(data.useExpiry) ||
    current.useSerial !== toYn(data.useSerial)
  if (structural) {
    const used = await hasStockOrOpenDoc(db, id)
    if (used.stock || used.asn) {
      throw new ActionError(
        'CONFLICT',
        `${used.stock ? '재고가' : '미완료 ASN이'} 있어 기본단위·기한/LOT/시리얼 관리 여부를 바꿀 수 없습니다.`,
      )
    }
  }
  const { byId } = await checkUnits(db, data, [
    current.baseUnitId,
    ...current.units.map((u) => u.unitId),
  ])
  const { rows, warnings } = await buildUnits(db, data, byId)
  // 환산수량 변경: 그 단위로 입력된 미완료 ASN이 있으면 막고, 바뀐 것은 이력에
  const before = new Map(
    current.units.map((u) => [u.unit.code, { level: u.level, qty: u.convQty.toString() }]),
  )
  const after = new Map(rows.map((r) => [r.unitCode, { level: r.level, qty: r.convQty }]))
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((code) => {
    const b = before.get(code)
    const a = after.get(code)
    return !b || !a || parseQty(b.qty) !== parseQty(a.qty)
  })
  const changedExisting = changed.filter(
    (code) => before.has(code) && before.get(code)!.level !== 'BASE',
  )
  if (changedExisting.length > 0) {
    const open = await db.asnLine.findFirst({
      where: { itemId: id, entryUnit: { in: changedExisting }, ...OPEN_ASN },
      select: { asn: { select: { asnNo: true } }, entryUnit: true },
    })
    if (open) {
      throw new ActionError(
        'CONFLICT',
        `${open.entryUnit} 단위로 입력된 미완료 ASN(${open.asn.asnNo})이 있어 환산수량을 바꿀 수 없습니다.`,
      )
    }
  }
  const barcodes = await buildBarcodes(db, current.shipperId, id, data)
  const saved = await withVersionGuard(() =>
    db.item.update({
      where: { id, rowVersion },
      data: {
        ...fieldsOf(data, rows),
        ...(options.requestId && { lastIfAt: new Date(), lastRequestId: options.requestId }),
      },
      select: { id: true, code: true, rowVersion: true, shipperId: true },
    }),
  )
  await writeChildren(db, saved, rows, barcodes)
  const actor = currentActor()
  for (const code of changed) {
    const b = before.get(code)
    const a = after.get(code)
    await db.itemUnitHist.create({
      data: {
        itemId: id,
        unitCode: code,
        level: (a ?? b)!.level,
        beforeQty: b ? new Prisma.Decimal(b.qty) : null,
        afterQty: a ? new Prisma.Decimal(a.qty) : null,
        changedBy: actor,
      },
    })
  }
  return {
    id,
    code: saved.code,
    rowVersion: saved.rowVersion,
    warnings,
    notice: warningNotice(warnings),
  }
}

export const createItem = (data: ItemCreateData, options?: ItemSaveOptions) =>
  prisma.$transaction((tx) => createItemIn(tx, data, options))

export const updateItem = (
  id: bigint,
  rowVersion: number,
  data: ItemData,
  options?: ItemSaveOptions,
) => prisma.$transaction((tx) => updateItemIn(tx, id, rowVersion, data, options))

// 사용 / 사용중지 (여러 건) — 단종은 ② 단계의 상태 변경에서
export async function setItemsActive(ids: bigint[], isActive: boolean) {
  const { count } = await prisma.item.updateMany({
    where: { id: { in: ids } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 쓰인 적 있는 품목 id (재고 줄 또는 ASN 라인이 있음 = 거래 이력이 있음)
export async function findUsedItemIds(ids: bigint[]): Promise<bigint[]> {
  if (ids.length === 0) return []
  const [stocks, asnLines] = await Promise.all([
    prisma.stock.findMany({
      where: { itemId: { in: ids } },
      distinct: ['itemId'],
      select: { itemId: true },
    }),
    prisma.asnLine.findMany({
      where: { itemId: { in: ids } },
      distinct: ['itemId'],
      select: { itemId: true },
    }),
  ])
  return [...new Set([...stocks, ...asnLines].map((r) => r.itemId))]
}

// 지우기: 쓰인 적 없는 품목만, 논리 삭제 (되살릴 수 있다). 외부 코드는 지우고, 바코드는 다른 품목이 쓸 수 있게 지운다
export async function deleteItems(ids: bigint[]) {
  if ((await findUsedItemIds(ids)).length > 0) {
    throw new ActionError(
      'CONFLICT',
      '재고·입고 기록이 있는 품목은 지울 수 없습니다. 사용 중지하세요.',
    )
  }
  return prisma.$transaction(async (tx) => {
    for (const id of ids) await deleteExternalCodes(tx, 'ITEM', id)
    await tx.itemBarcode.deleteMany({ where: { itemId: { in: ids } } })
    const { count } = await tx.item.updateMany({ where: { id: { in: ids } }, data: DELETED_ONLY })
    return { count }
  })
}

// 되살리기: 같은 화주사에 같은 품목코드가 이미 다시 생겼으면 거부 (바코드는 지울 때 비웠으므로 다시 넣는다)
export async function restoreItems(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.item.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { shipperId: true, code: true },
    })
    assertAllFound(rows.length, ids.length, '품목')
    const taken = await tx.item.findMany({
      where: { OR: rows.map((r) => ({ shipperId: r.shipperId, code: r.code })) },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '품목코드',
    )
    const { count } = await tx.item.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
