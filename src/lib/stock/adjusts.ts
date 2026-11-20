import 'server-only'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { nextDocumentNumber } from '@/lib/documents/doc-no'
import { prisma, type Tx } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { checkQtyDecimals, parseQty, qtyText } from '@/lib/units/convert'
import { ADJUST_TYPE_LABELS, type AdjustData } from './adjust-schema'
import { adjustStock } from './stock-change'
import { stockTransaction } from './stock-transaction'
import { labelOf } from '@/lib/db-value'

// 재고 실사·조정 (docs/decisions/0061)
// 등록(작업자): 재고 줄마다 센 수량 또는 바꿀 수량 — 재고는 아직 그대로
// 확정(관리자): 실사는 (센 수량 − 확정 때 재고), 조정은 적은 수량만큼 재고 변경 공통 함수(adjustStock)로 바꾼다
// 취소: 등록 상태에서만

export const ADJUST_SCOPE = { center: 'centerId' }

export async function assertAdjustsInScope(ids: bigint[], scope: DataScope) {
  if (scope.kind === 'SHIPPER')
    throw new ActionError('FORBIDDEN', '화주사 사용자는 쓸 수 없습니다.')
  const count = await prisma.stockAdjust.count({
    where: { AND: [{ id: { in: ids } }, scopeFilter(scope, ADJUST_SCOPE)] },
  })
  if (count !== new Set(ids).size)
    throw new ActionError('NOT_FOUND', '실사·조정을 찾을 수 없습니다.')
}

export async function createAdjust(data: AdjustData, scope: DataScope) {
  const operatorId = requireOperatorId()
  if (scope.kind === 'SHIPPER')
    throw new ActionError('FORBIDDEN', '화주사 사용자는 쓸 수 없습니다.')
  if (scope.kind === 'CENTERS' && !scope.centerIds.includes(data.centerId)) {
    throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
  }
  return prisma.$transaction(async (tx) => {
    const stocks = await tx.stock.findMany({
      where: { id: { in: data.lines.map((l) => l.stockId) }, centerId: data.centerId },
      select: {
        id: true,
        qty: true,
        item: {
          select: {
            code: true,
            baseUnit: { select: { code: true, ...unitDecimalsSelect(requireOperatorId()) } },
          },
        },
      },
    })
    // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
    resolveUnitDecimals(stocks)
    const byId = new Map(stocks.map((s) => [s.id, s]))
    const lines = data.lines.map((line, index) => {
      const stock = byId.get(line.stockId)
      if (!stock) {
        throw new ActionError('VALIDATION', `${index + 1}번째 줄: 이 센터의 재고가 아닙니다.`)
      }
      const unit = stock.item.baseUnit
      if (!checkQtyDecimals(line.qty.replace('-', ''), unit.decimals)) {
        throw new ActionError(
          'VALIDATION',
          `${index + 1}번째 줄: ${unit.code} 수량은 소수 ${unit.decimals}자리까지입니다.`,
        )
      }
      return {
        operatorId,
        lineNo: index + 1,
        stockId: stock.id,
        systemQty: stock.qty,
        countedQty: data.type === 'COUNT' ? qtyText(parseQty(line.qty)) : null,
        changeQty: data.type === 'ADJUST' ? qtyText(parseQty(line.qty)) : null,
      }
    })
    const adjust = await tx.stockAdjust.create({
      data: {
        operatorId,
        adjustNo: await nextDocumentNumber('ADJUST', tx),
        type: data.type,
        centerId: data.centerId,
        reason: data.reason,
        remark: data.remark,
        createdBy: currentActor(),
      },
      select: { id: true, adjustNo: true },
    })
    await tx.stockAdjustLine.createMany({
      data: lines.map((line) => ({ ...line, adjustId: adjust.id })),
    })
    return adjust
  })
}

// 재고 줄 잠그고 지금 수량 읽기 (실사 차이를 정확히 계산하려고, 같은 트랜잭션의 adjustStock도 같은 잠금을 쓴다)
async function lockedQty(tx: Tx, stockId: bigint) {
  const [row] = await tx.$queryRaw<{ qty: string }[]>`
    SELECT stock_qty::text AS qty FROM tb_stock WHERE stock_id = ${stockId} FOR UPDATE`
  return parseQty(row.qty)
}

export async function confirmAdjust(id: bigint) {
  return stockTransaction(async (tx) => {
    // 두 번 확정되지 않게: 등록 상태일 때만 확정으로 바꾼다
    const { count } = await tx.stockAdjust.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: currentActor() },
    })
    if (count !== 1) throw new ActionError('CONFLICT', '등록 상태가 아니라 확정할 수 없습니다.')
    const adjust = await tx.stockAdjust.findUniqueOrThrow({
      where: { id },
      select: {
        adjustNo: true,
        type: true,
        reason: true,
        lines: {
          orderBy: { lineNo: 'asc' },
          select: {
            id: true,
            countedQty: true,
            changeQty: true,
            stock: {
              select: { id: true, locationId: true, itemId: true, lotNo: true, expiryOn: true },
            },
          },
        },
      },
    })
    let applied = 0
    for (const line of adjust.lines) {
      const current = await lockedQty(tx, line.stock.id)
      const change =
        adjust.type === 'COUNT'
          ? parseQty(line.countedQty!.toString()) - current
          : parseQty(line.changeQty!.toString())
      let stockTxnId: bigint | null = null
      if (change !== 0n) {
        const reason =
          `${labelOf(ADJUST_TYPE_LABELS, adjust.type)} ${adjust.adjustNo}: ${adjust.reason}`.slice(
            0,
            200,
          )
        const result = await adjustStock(tx, {
          address: {
            locationId: line.stock.locationId,
            itemId: line.stock.itemId,
            lotNo: line.stock.lotNo,
            expiryOn: line.stock.expiryOn?.toISOString().slice(0, 10) ?? null,
          },
          qty: qtyText(change),
          reason,
          ref: { refType: 'ADJUSTMENT', refId: id, refNo: adjust.adjustNo },
        })
        stockTxnId = result.txnId
        applied += 1
      }
      await tx.stockAdjustLine.update({
        where: { id: line.id },
        data: { appliedQty: qtyText(change), stockTxnId },
      })
    }
    return { adjustNo: adjust.adjustNo, applied }
  })
}

export async function cancelAdjust(id: bigint) {
  const { count } = await prisma.stockAdjust.updateMany({
    where: { id, status: 'DRAFT' },
    data: { status: 'CANCELED', canceledAt: new Date(), canceledBy: currentActor() },
  })
  if (count !== 1) throw new ActionError('CONFLICT', '등록 상태만 취소할 수 있습니다.')
  return { count }
}
