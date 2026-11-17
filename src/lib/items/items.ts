import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { looksLikeSystemCode } from '@/config/master-codes'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { deleteExternalCodes } from '@/lib/master-code/external-codes'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, isActiveStatus, toStatus } from '@/lib/status'
import { isItemBaseType } from '@/lib/units/unit-labels'
import { checkQtyDecimals } from '@/lib/units/convert'
import { isYes } from '@/lib/yn'
import { effectiveItemOptions, type ItemCreateData, type ItemData } from './item-schema'

// 외부 코드는 외부코드 매핑 메뉴에서 (0068) — 품목 저장은 매핑을 건드리지 않는다
type SaveItemData = ItemData
type CreateItemData = ItemCreateData

// 품목 저장 (docs/decisions/0041). 권한·데이터 범위 검사는 서버 액션에서 한다
// - 화주사는 등록 후 바꿀 수 없다 (재고·이력이 화주사에 묶인다)
// - 환산단위는 저장할 때마다 통째로 바꾼다 (품목의 이력으로 본다)

// 품목코드: 시스템 코드 모양 금지(자기 것 제외), 같은 화주사 안에서 중복 금지
async function assertItemCode(
  db: Db,
  shipperId: bigint,
  code: string,
  ownSystemCode: string,
  exceptId?: bigint,
) {
  if (code !== ownSystemCode && looksLikeSystemCode('ITEM', code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 시스템 코드 모양이라 품목코드로 쓸 수 없습니다.`,
    )
  }
  const owner = await db.item.findFirst({ where: { shipperId, code }, select: { id: true } })
  if (owner && owner.id !== exceptId) {
    throw new ActionError('CONFLICT', `이 화주사에 이미 있는 품목코드입니다: ${code}`)
  }
}

// 바코드: 같은 화주사 안에서 중복 금지
async function assertBarcode(db: Db, shipperId: bigint, barcode: string | null, exceptId?: bigint) {
  if (!barcode) return
  const owner = await db.item.findFirst({ where: { shipperId, barcode }, select: { id: true } })
  if (owner && owner.id !== exceptId) {
    throw new ActionError('CONFLICT', `이 화주사에 이미 있는 바코드입니다: ${barcode}`)
  }
}

// 단위 검사: 기본단위는 포장이 아닌 단위(수량·중량·부피·길이·면적), 환산단위는 포장 단위(PACK)만, 새로 고르는 단위는 사용 중이어야 한다 (0078)
// keep: 이미 저장돼 있던 단위 (그 사이 사용 중지됐어도 그대로 둘 수 있다)
// 입수량 소수 자리는 기본단위의 소수 자리수까지 (EA면 정수만)
async function assertUnits(db: Db, data: SaveItemData, keep: bigint[] = []) {
  const ids = [data.baseUnitId, ...data.units.map((u) => u.unitId)]
  const units = await db.unit.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, type: true, decimals: true, status: true },
  })
  const byId = new Map(units.map((u) => [u.id, u]))
  const usable = (id: bigint) => {
    const unit = byId.get(id)
    return unit && (isActiveStatus(unit.status) || keep.includes(id)) ? unit : null
  }
  const base = usable(data.baseUnitId)
  if (!base || !isItemBaseType(base.type)) {
    throw new ActionError(
      'VALIDATION',
      '기본단위는 사용 중인 수량·중량·부피·길이·면적 단위 중에서 골라 주세요.',
    )
  }
  for (const row of data.units) {
    const pack = usable(row.unitId)
    if (!pack || pack.type !== 'PACK') {
      throw new ActionError('VALIDATION', '환산단위는 사용 중인 포장 단위 중에서 골라 주세요.')
    }
    if (!checkQtyDecimals(row.convQty, base.decimals)) {
      throw new ActionError(
        'VALIDATION',
        base.decimals === 0
          ? `${pack.code} 입수량은 정수로 입력해 주세요. (기본단위 ${base.code})`
          : `${pack.code} 입수량은 소수 ${base.decimals}자리까지입니다. (기본단위 ${base.code})`,
      )
    }
  }
}

// DB 칸으로 옮길 값 (관리 옵션은 '' → null = 화주사 기본값 따름)
// 유통기한을 실제로 쓰지 않으면 임박 기준 일수는 비운다
function fieldsOf(
  data: SaveItemData,
  shipper: { useLot: string; useExpiry: string; labelUnit: 'PLT' | 'BOX' },
) {
  const options = effectiveItemOptions(data, {
    useLot: isYes(shipper.useLot),
    useExpiry: isYes(shipper.useExpiry),
    labelUnit: shipper.labelUnit,
  })
  return {
    name: data.name,
    spec: data.spec,
    barcode: data.barcode,
    baseUnitId: data.baseUnitId,
    useLot: data.useLot || null,
    useExpiry: data.useExpiry || null,
    labelUnit: data.labelUnit || null,
    expiryAlertDays: options.useExpiry ? data.expiryAlertDays : null,
    remark: data.remark,
  }
}

const unitRows = (itemId: bigint, units: ItemData['units']) =>
  units.map((u, index) => ({
    itemId,
    unitId: u.unitId,
    convQty: new Prisma.Decimal(u.convQty),
    sortOrder: index,
  }))

const SHIPPER_DEFAULTS = { useLot: true, useExpiry: true, labelUnit: true, status: true } as const

// 등록 (한 트랜잭션: 시스템 코드 → 품목 → 환산단위 → 외부 코드)
export async function createItem(data: CreateItemData) {
  return prisma.$transaction(async (tx) => {
    const shipper = await tx.shipper.findUnique({
      where: { id: data.shipperId },
      select: SHIPPER_DEFAULTS,
    })
    if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
    if (!isActiveStatus(shipper.status)) {
      throw new ActionError('CONFLICT', '사용 중지된 화주사에는 품목을 등록할 수 없습니다.')
    }
    const systemCode = await nextSystemCode('ITEM', tx)
    const code = data.code || systemCode
    await assertItemCode(tx, data.shipperId, code, systemCode)
    await assertBarcode(tx, data.shipperId, data.barcode)
    await assertUnits(tx, data)
    const item = await tx.item.create({
      data: {
        ...fieldsOf(data, shipper),
        operatorId: requireOperatorId(),
        shipperId: data.shipperId,
        systemCode,
        code,
      },
      select: { id: true, systemCode: true, code: true, rowVersion: true },
    })
    await tx.itemUnit.createMany({ data: unitRows(item.id, data.units) })
    return item
  })
}

// 수정: 시스템 코드·화주사는 바뀌지 않는다. 품목코드를 비우면 시스템 코드로
// TODO(재고 작업, ROADMAP M4): 재고가 있는 품목의 기본단위는 바꿀 수 없게 막는다
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateItem(id: bigint, rowVersion: number, data: SaveItemData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.item.findUnique({
      where: { id },
      select: {
        rowVersion: true,
        systemCode: true,
        shipperId: true,
        baseUnitId: true,
        units: { select: { unitId: true } },
        shipper: { select: SHIPPER_DEFAULTS },
      },
    })
    assertRowVersion(found, rowVersion, '품목을 찾을 수 없습니다.')
    const current = found!
    const code = data.code || current.systemCode
    await assertItemCode(tx, current.shipperId, code, current.systemCode, id)
    await assertBarcode(tx, current.shipperId, data.barcode, id)
    await assertUnits(tx, data, [current.baseUnitId, ...current.units.map((u) => u.unitId)])
    const saved = await withVersionGuard(() =>
      tx.item.update({
        where: { id, rowVersion },
        data: { ...fieldsOf(data, current.shipper), code },
        select: { id: true, code: true, rowVersion: true },
      }),
    )
    await tx.itemUnit.deleteMany({ where: { itemId: id } })
    await tx.itemUnit.createMany({ data: unitRows(id, data.units) })
    return saved
  })
}

// 사용 중지 / 다시 사용 (여러 건)
export async function setItemsActive(ids: bigint[], isActive: boolean) {
  const { count } = await prisma.item.updateMany({
    where: { id: { in: ids } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 쓰인 적 있는 품목 id (재고 줄이 있음 = 재고 이력이 있음, docs/decisions/0045)
// TODO(입고 작업, ROADMAP M5): ASN 표가 생기면 ASN에 쓰인 품목도 더한다
export async function findUsedItemIds(ids: bigint[]): Promise<bigint[]> {
  if (ids.length === 0) return []
  const rows = await prisma.stock.findMany({
    where: { itemId: { in: ids } },
    distinct: ['itemId'],
    select: { itemId: true },
  })
  return rows.map((r) => r.itemId)
}

// 지우기: 쓰인 적 없는 품목만, 논리 삭제 (되살릴 수 있다). 외부 코드는 지운다
export async function deleteItems(ids: bigint[]) {
  if ((await findUsedItemIds(ids)).length > 0) {
    throw new ActionError(
      'CONFLICT',
      '재고·입고 기록이 있는 품목은 지울 수 없습니다. 사용 중지하세요.',
    )
  }
  return prisma.$transaction(async (tx) => {
    for (const id of ids) await deleteExternalCodes(tx, 'ITEM', id)
    const { count } = await tx.item.updateMany({ where: { id: { in: ids } }, data: DELETED_ONLY })
    return { count }
  })
}

// 되살리기: 같은 화주사에 같은 품목코드·바코드가 이미 다시 생겼으면 거부
export async function restoreItems(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.item.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { shipperId: true, code: true, barcode: true },
    })
    assertAllFound(rows.length, ids.length, '품목')
    const takenCodes = await tx.item.findMany({
      where: { OR: rows.map((r) => ({ shipperId: r.shipperId, code: r.code })) },
      select: { code: true },
    })
    assertNoCodeConflict(
      takenCodes.map((t) => t.code),
      '품목코드',
    )
    const withBarcode = rows.filter((r) => r.barcode)
    if (withBarcode.length > 0) {
      const takenBarcodes = await tx.item.findMany({
        where: { OR: withBarcode.map((r) => ({ shipperId: r.shipperId, barcode: r.barcode })) },
        select: { barcode: true },
      })
      assertNoCodeConflict(
        takenBarcodes.map((t) => t.barcode!),
        '바코드',
      )
    }
    const { count } = await tx.item.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
