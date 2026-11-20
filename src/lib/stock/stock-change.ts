import { shipperDefaultsSelect, shipperItemDefaults } from '@/lib/shippers/shipper-defaults'
import { ActionError } from '@/lib/actions/action-error'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { effectiveItemOptions } from '@/lib/items/item-schema'
import type { Tx } from '@/lib/prisma'
import { isActiveStatus } from '@/lib/status'
import { checkQtyDecimals, formatQty, parseQty, qtyText } from '@/lib/units/convert'
import { withStockWrite } from './stock-write-guard'

// 재고 변경 공통 함수 (docs/decisions/0045, CLAUDE.md "재고는 직접 수정 금지")
// 재고 수량은 이 파일의 세 함수로만 바꾼다: 입고(receiveStock)·이동(moveStock)·조정(adjustStock)
//
// 함수마다 하는 일 (모두 부르는 쪽의 트랜잭션 tx 안에서):
// 1. 로케이션·품목을 읽고 규칙 검사 (운영사, 수량 소수 자리, 로트·유통기한, 사용 중지)
// 2. 재고 줄을 잠근다 (없으면 만들고 잠금) → 동시에 같은 재고를 바꾸는 요청은 줄을 서서 차례로 처리된다
// 3. 수량을 바꾸고 이력을 한 줄 남긴다 (수량과 이력이 함께 저장되거나 함께 취소된다)
//
// 부르는 법: prisma.$transaction((tx) => receiveStock(tx, { ... }))
// 운영사 출입증(createAction 또는 runInContext) 안에서 불러야 한다

// 재고 주소: 로케이션 + 품목 + 로트 + 유통기한 (유통기한은 'YYYY-MM-DD' 글자)
export type StockAddress = {
  locationId: bigint
  itemId: bigint
  lotNo?: string | null
  expiryOn?: string | null
}

// 원본 문서 (예: RECEIPT 입고확정 / 키 / 화면 번호)
export type StockRef = { refType?: string; refId?: bigint; refNo?: string }

export type StockChangeResult = { stockId: bigint; txnId: bigint; qtyAfter: string }

// ─── 읽기·검사 ──────────────────────────────────────────────

// 늘리기(IN)인지 줄이기(OUT)인지에 따라 검사가 다르다 (사용자 결정):
// - 사용 중지된 로케이션·품목, 화주사가 이용하지 않는 센터 → 늘리기만 막는다 (남은 재고는 빼낼 수 있어야 한다)
// - 로트·유통기한 규칙 → 늘리기만 검사한다 (줄이기는 이미 있는 재고 주소를 그대로 쓴다)
type Direction = 'IN' | 'OUT'

type ResolvedAddress = {
  operatorId: bigint
  centerId: bigint
  warehouseId: bigint
  locationId: bigint
  locationCode: string
  shipperId: bigint
  itemId: bigint
  itemCode: string
  lotNo: string | null
  expiryOn: string | null
  baseUnit: { code: string; decimals: number }
}

// 유통기한 글자 검사 ('YYYY-MM-DD', 실제 있는 날짜)
function normalizeExpiry(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  const date = new Date(`${text}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  ) {
    throw new ActionError('VALIDATION', `유통기한 형식이 올바르지 않습니다: '${text}'`)
  }
  return text
}

const toDate = (expiry: string | null) => (expiry ? new Date(`${expiry}T00:00:00.000Z`) : null)

async function resolveAddress(
  tx: Tx,
  address: StockAddress,
  direction: Direction,
): Promise<ResolvedAddress> {
  const operatorId = requireOperatorId()
  // 운영사 출입증 안이라 다른 운영사·지운 로케이션/품목은 자동으로 안 보인다 (prisma.ts)
  const location = await tx.location.findUnique({
    where: { id: address.locationId },
    select: {
      id: true,
      code: true,
      status: true,
      warehouseId: true,
      warehouse: { select: { centerId: true } },
    },
  })
  if (!location) throw new ActionError('NOT_FOUND', '로케이션을 찾을 수 없습니다.')

  const item = await tx.item.findUnique({
    where: { id: address.itemId },
    select: {
      id: true,
      code: true,
      status: true,
      shipperId: true,
      useLot: true,
      useExpiry: true,
      labelUnit: true,
      baseUnit: { select: { code: true, ...unitDecimalsSelect(requireOperatorId()) } },
      shipper: {
        select: {
          ...shipperDefaultsSelect,
          // 이 로케이션의 센터를 화주사가 이용하는지
          centers: { where: { centerId: location.warehouse.centerId }, select: { centerId: true } },
        },
      },
    },
  })
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(item)
  if (!item) throw new ActionError('NOT_FOUND', '품목을 찾을 수 없습니다.')

  const lotNo = address.lotNo?.trim() || null
  const expiryOn = normalizeExpiry(address.expiryOn)

  if (direction === 'IN') {
    if (!isActiveStatus(location.status)) {
      throw new ActionError(
        'VALIDATION',
        `사용 중지된 로케이션에는 재고를 넣을 수 없습니다: ${location.code}`,
      )
    }
    if (!isActiveStatus(item.status)) {
      throw new ActionError(
        'VALIDATION',
        `사용 중지된 품목은 재고를 늘릴 수 없습니다: ${item.code}`,
      )
    }
    if (item.shipper.centers.length === 0) {
      throw new ActionError(
        'VALIDATION',
        `이 품목의 화주사는 이 로케이션의 센터를 이용하지 않습니다: ${item.code}`,
      )
    }
    // 로트·유통기한: 품목 설정(비어 있으면 화주사 기본값)에 따라 필수 또는 비움 (CLAUDE.md)
    const options = effectiveItemOptions(
      {
        useLot: item.useLot as 'Y' | 'N' | null,
        useExpiry: item.useExpiry as 'Y' | 'N' | null,
        labelUnit: item.labelUnit,
      },
      shipperItemDefaults(item.shipper),
    )
    if (options.useLot && !lotNo) {
      throw new ActionError('VALIDATION', `로트번호를 넣어 주세요 (로트 관리 품목): ${item.code}`)
    }
    if (!options.useLot && lotNo) {
      throw new ActionError('VALIDATION', `로트를 관리하지 않는 품목입니다: ${item.code}`)
    }
    if (options.useExpiry && !expiryOn) {
      throw new ActionError(
        'VALIDATION',
        `유통기한을 넣어 주세요 (유통기한 관리 품목): ${item.code}`,
      )
    }
    if (!options.useExpiry && expiryOn) {
      throw new ActionError('VALIDATION', `유통기한을 관리하지 않는 품목입니다: ${item.code}`)
    }
  }

  return {
    operatorId,
    centerId: location.warehouse.centerId,
    warehouseId: location.warehouseId,
    locationId: location.id,
    locationCode: location.code,
    shipperId: item.shipperId,
    itemId: item.id,
    itemCode: item.code,
    lotNo,
    expiryOn,
    baseUnit: item.baseUnit,
  }
}

// 수량 검사: 형식, 기본단위 소수 자리 (EA 0자리 → 2.5 불가). 결과는 고정 소수점 정수
function parseChange(qty: string, unit: { code: string; decimals: number }): bigint {
  let value: bigint
  try {
    value = parseQty(qty)
  } catch (error) {
    throw new ActionError('VALIDATION', (error as Error).message)
  }
  if (!checkQtyDecimals(qty, unit.decimals)) {
    throw new ActionError(
      'VALIDATION',
      unit.decimals === 0
        ? `${unit.code} 수량은 정수만 넣을 수 있습니다: ${qty}`
        : `${unit.code} 수량은 소수 ${unit.decimals}자리까지입니다: ${qty}`,
    )
  }
  return value
}

// ─── 재고 줄 찾기·만들기·잠그기 (직접 SQL) ────────────────────
// 직접 SQL을 쓰는 이유:
// - 없으면 만들기: 동시에 두 요청이 같은 줄을 만들어도 오류 없이 하나만 생기게 (ON CONFLICT DO NOTHING)
//   (Prisma create는 고유 규칙에 걸리면 트랜잭션 전체가 실패한다)
// - 잠그기: SELECT ... FOR UPDATE (Prisma에는 줄 잠금이 없다)
// 로트·유통기한은 비어 있을 수 있어 IS NOT DISTINCT FROM(빈 칸끼리 같다)으로 찾는다 — 고유 규칙(NULLS NOT DISTINCT)과 같은 뜻

async function findStockId(tx: Tx, a: ResolvedAddress): Promise<bigint | null> {
  const rows = await tx.$queryRaw<{ stock_id: bigint }[]>`
    SELECT stock_id FROM tb_stock
    WHERE location_id = ${a.locationId} AND item_id = ${a.itemId}
      AND lot_no IS NOT DISTINCT FROM ${a.lotNo}::varchar
      AND expiry_dt IS NOT DISTINCT FROM ${a.expiryOn}::date`
  return rows[0]?.stock_id ?? null
}

async function ensureStockId(tx: Tx, a: ResolvedAddress): Promise<bigint> {
  await tx.$executeRaw`
    INSERT INTO tb_stock (operator_id, center_id, warehouse_id, location_id, shipper_id, item_id, lot_no, expiry_dt, updated_at)
    VALUES (${a.operatorId}, ${a.centerId}, ${a.warehouseId}, ${a.locationId}, ${a.shipperId}, ${a.itemId},
            ${a.lotNo}::varchar, ${a.expiryOn}::date, CURRENT_TIMESTAMP)
    ON CONFLICT DO NOTHING`
  const id = await findStockId(tx, a)
  if (id === null) throw new Error('재고 줄을 만들지 못했습니다.')
  return id
}

type LockedStock = { id: bigint; qty: bigint; allocated: bigint }

// 줄 잠금: 트랜잭션이 끝날 때까지 다른 요청은 이 줄을 바꾸지 못하고 기다린다
// 여러 줄은 항상 키 순서로 잠근다 → 두 요청이 서로를 기다리는 교착(데드락)을 막는다
async function lockStocks(tx: Tx, ids: bigint[]): Promise<Map<bigint, LockedStock>> {
  const locked = new Map<bigint, LockedStock>()
  for (const id of [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const [row] = await tx.$queryRaw<{ qty: string; allocated: string }[]>`
      SELECT stock_qty::text AS qty, alloc_qty::text AS allocated
      FROM tb_stock WHERE stock_id = ${id} FOR UPDATE`
    locked.set(id, { id, qty: parseQty(row.qty), allocated: parseQty(row.allocated) })
  }
  return locked
}

// ─── 수량 바꾸기 + 이력 ──────────────────────────────────────

type TxnFields = {
  type: 'RECEIVE' | 'MOVE_OUT' | 'MOVE_IN' | 'ADJUST'
  ref?: StockRef
  reason?: string | null
  // 이동처럼 두 줄이 한 작업이면 첫 줄의 이력 키를 미리 받아 와서 둘 다에 쓴다
  id?: bigint
  groupId?: bigint
}

// 줄이면 할당되지 않은 수량(수량 − 할당)까지만 뺄 수 있다
function shortage(a: ResolvedAddress, stock: LockedStock | null, change: bigint) {
  const qty = stock?.qty ?? 0n
  const allocated = stock?.allocated ?? 0n
  return new ActionError(
    'CONFLICT',
    `재고가 부족합니다: ${a.itemCode} @ ${a.locationCode}` +
      ` (현재 ${formatQty(qtyText(qty))}, 할당 ${formatQty(qtyText(allocated))},` +
      ` 뺄 수 있는 수량 ${formatQty(qtyText(qty - allocated))}, 요청 ${formatQty(qtyText(-change))})`,
  )
}

async function applyChange(
  tx: Tx,
  a: ResolvedAddress,
  stock: LockedStock,
  change: bigint,
  fields: TxnFields,
): Promise<StockChangeResult> {
  const after = stock.qty + change
  if (after < 0n || after < stock.allocated) throw shortage(a, stock, change)

  await tx.stock.update({
    where: { id: stock.id },
    data: { qty: qtyText(after), rowVersion: { increment: 1 } },
  })
  const txn = await tx.stockTxn.create({
    data: {
      id: fields.id,
      operatorId: a.operatorId,
      stockId: stock.id,
      centerId: a.centerId,
      warehouseId: a.warehouseId,
      locationId: a.locationId,
      shipperId: a.shipperId,
      itemId: a.itemId,
      lotNo: a.lotNo,
      expiryOn: toDate(a.expiryOn),
      type: fields.type,
      qtyChange: qtyText(change),
      qtyAfter: qtyText(after),
      groupId: fields.groupId,
      refType: fields.ref?.refType,
      refId: fields.ref?.refId,
      refNo: fields.ref?.refNo,
      reason: fields.reason,
      createdBy: currentActor(),
    },
    select: { id: true },
  })
  // 메모리에 든 잠긴 줄도 맞춰 둔다 (같은 줄을 한 번 더 바꾸는 경우 대비)
  stock.qty = after
  return { stockId: stock.id, txnId: txn.id, qtyAfter: qtyText(after) }
}

// ─── 공개 함수 ──────────────────────────────────────────────

// 입고: 재고를 늘린다 (입고 확정 → 입고대기 창고)
export async function receiveStock(
  tx: Tx,
  input: { address: StockAddress; qty: string; ref?: StockRef; reason?: string },
): Promise<StockChangeResult> {
  return withStockWrite(async () => {
    const a = await resolveAddress(tx, input.address, 'IN')
    const change = parseChange(input.qty, a.baseUnit)
    if (change <= 0n) throw new ActionError('VALIDATION', '입고 수량은 0보다 커야 합니다.')
    const id = await ensureStockId(tx, a)
    const stock = (await lockStocks(tx, [id])).get(id)!
    return applyChange(tx, a, stock, change, {
      type: 'RECEIVE',
      ref: input.ref,
      reason: input.reason?.trim() || null,
    })
  })
}

// 이동(적치 포함): 같은 품목·로트·유통기한을 다른 로케이션으로 (같은 센터 안에서만)
// 나감(MOVE_OUT) + 들어옴(MOVE_IN) 두 줄, 같은 묶음 번호(groupId = 나감 줄의 이력 키)
export async function moveStock(
  tx: Tx,
  input: {
    from: StockAddress
    toLocationId: bigint
    qty: string
    ref?: StockRef
    reason?: string
  },
): Promise<{ groupId: bigint; out: StockChangeResult; in: StockChangeResult }> {
  return withStockWrite(async () => {
    if (input.from.locationId === input.toLocationId) {
      throw new ActionError('VALIDATION', '같은 로케이션으로는 옮길 수 없습니다.')
    }
    const from = await resolveAddress(tx, input.from, 'OUT')
    // 센터가 다른지 먼저 본다 (도착 로케이션의 다른 검사보다 이 안내가 더 정확하다)
    const target = await tx.location.findUnique({
      where: { id: input.toLocationId },
      select: { warehouse: { select: { centerId: true } } },
    })
    if (target && target.warehouse.centerId !== from.centerId) {
      throw new ActionError('VALIDATION', '다른 센터의 로케이션으로는 옮길 수 없습니다.')
    }
    const to = await resolveAddress(tx, { ...input.from, locationId: input.toLocationId }, 'IN')
    const qty = parseChange(input.qty, from.baseUnit)
    if (qty <= 0n) throw new ActionError('VALIDATION', '이동 수량은 0보다 커야 합니다.')

    // 출발 재고가 아예 없으면 부족 (빈 줄을 만들지 않는다)
    const fromId = await findStockId(tx, from)
    if (fromId === null) throw shortage(from, null, -qty)
    const toId = await ensureStockId(tx, to)
    const locked = await lockStocks(tx, [fromId, toId])

    // 이력은 고칠 수 없어(트리거) 나중에 묶음 번호를 채울 수 없다 → 키를 미리 받아 첫 줄에 쓴다
    const [{ id: groupId }] = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT nextval(pg_get_serial_sequence('tb_stock_txn', 'stock_txn_id')) AS id`
    const reason = input.reason?.trim() || null
    const out = await applyChange(tx, from, locked.get(fromId)!, -qty, {
      type: 'MOVE_OUT',
      ref: input.ref,
      reason,
      id: groupId,
      groupId,
    })
    const moved = await applyChange(tx, to, locked.get(toId)!, qty, {
      type: 'MOVE_IN',
      ref: input.ref,
      reason,
      groupId,
    })
    return { groupId, out, in: moved }
  })
}

// 조정: 늘리거나(+) 줄인다(−), 사유 필수 (CLAUDE.md)
export async function adjustStock(
  tx: Tx,
  input: { address: StockAddress; qty: string; reason: string; ref?: StockRef },
): Promise<StockChangeResult> {
  return withStockWrite(async () => {
    const reason = input.reason?.trim()
    if (!reason) throw new ActionError('VALIDATION', '재고 조정은 사유를 넣어 주세요.')
    if (reason.length > 200) throw new ActionError('VALIDATION', '사유는 200자까지입니다.')

    // 늘리는지 줄이는지는 수량 부호로 정해진다 → 먼저 부호만 본다
    let sign: bigint
    try {
      sign = parseQty(input.qty)
    } catch (error) {
      throw new ActionError('VALIDATION', (error as Error).message)
    }
    if (sign === 0n) throw new ActionError('VALIDATION', '조정 수량은 0이 아니어야 합니다.')

    const a = await resolveAddress(tx, input.address, sign > 0n ? 'IN' : 'OUT')
    const change = parseChange(input.qty, a.baseUnit)

    let id: bigint | null
    if (change > 0n) {
      id = await ensureStockId(tx, a)
    } else {
      id = await findStockId(tx, a)
      if (id === null) throw shortage(a, null, change)
    }
    const stock = (await lockStocks(tx, [id])).get(id)!
    return applyChange(tx, a, stock, change, { type: 'ADJUST', ref: input.ref, reason })
  })
}
