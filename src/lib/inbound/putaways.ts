import 'server-only'
import { isYes } from '@/lib/yn'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import type { Db } from '@/lib/prisma'
import { moveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { parseQty, qtyText } from '@/lib/units/convert'
import type { PutawayData } from './putaway-schema'

// 적치 등록 (docs/decisions/0058, 0003 결정 5)
// - 입고 확정으로 생긴 재고만 (입고확정 라인 단위), 남은 수량(확정 − 적치) 안에서 일부만도 된다
// - 입고대기 창고 → 같은 센터의 일반 창고 로케이션으로 재고 이동 (moveStock, 나감·들어옴 두 줄 + 묶음 번호)
// - 마감된 ASN도 이미 확정된 재고는 적치할 수 있다
// - 끝나면 ASN 적치 상태: 적치대기 / 부분적치 / 적치완료(입고가 끝났고 확정분을 모두 적치)

// 적치 상태 다시 계산 (적치 뒤, 잔량 마감 뒤)
export async function refreshPutawayStatus(tx: Db, asnId: bigint) {
  const asn = await tx.asn.findUniqueOrThrow({
    where: { id: asnId },
    select: { status: true, lines: { select: { confirmedQty: true, putawayQty: true } } },
  })
  const anyPutaway = asn.lines.some((l) => parseQty(l.putawayQty.toString()) > 0n)
  const allPutaway = asn.lines.every(
    (l) => parseQty(l.putawayQty.toString()) >= parseQty(l.confirmedQty.toString()),
  )
  const finished = asn.status === 'COMPLETED' || asn.status === 'CLOSED'
  const putawayStatus =
    finished && allPutaway && anyPutaway ? 'DONE' : anyPutaway ? 'PARTIAL' : 'WAITING'
  await tx.asn.update({ where: { id: asnId }, data: { putawayStatus } })
  return putawayStatus
}

export async function registerPutaway(data: PutawayData) {
  const operatorId = requireOperatorId()
  return stockTransaction(async (tx) => {
    const asn = await tx.asn.findUnique({
      where: { id: data.asnId },
      select: { id: true, asnNo: true, centerId: true },
    })
    if (!asn) throw new ActionError('NOT_FOUND', 'ASN을 찾을 수 없습니다.')

    const created: bigint[] = []
    for (const [index, line] of data.lines.entries()) {
      const at = `${index + 1}번째 줄`
      const receiptLine = await tx.inboundReceiptLine.findUnique({
        where: { id: line.receiptLineId },
        select: {
          id: true,
          qty: true,
          putawayQty: true,
          asnLineId: true,
          lotNo: true,
          expiryOn: true,
          receipt: { select: { asnId: true } },
          stock: { select: { locationId: true, itemId: true } },
        },
      })
      if (!receiptLine || receiptLine.receipt.asnId !== asn.id) {
        throw new ActionError('NOT_FOUND', `${at}: 이 ASN의 입고확정 줄이 아닙니다.`)
      }
      // 보관 로케이션: 같은 센터의 입고 가능 창고 (시스템 기본 창고=대기 창고로는 적치하지 않는다, 0074)
      const target = await tx.location.findUnique({
        where: { id: line.toLocationId },
        select: {
          code: true,
          warehouse: { select: { centerId: true, systemYn: true, inboundYn: true } },
        },
      })
      if (!target || target.warehouse.centerId !== asn.centerId) {
        throw new ActionError('VALIDATION', `${at}: 이 센터의 로케이션을 골라 주세요.`)
      }
      if (isYes(target.warehouse.systemYn) || !isYes(target.warehouse.inboundYn)) {
        throw new ActionError(
          'VALIDATION',
          `${at}: 입고 가능한 창고의 보관 로케이션을 골라 주세요. (대기 창고 제외)`,
        )
      }

      const qty = parseQty(line.qty)
      const total = parseQty(receiptLine.qty.toString())
      const available = total - parseQty(receiptLine.putawayQty.toString())
      if (qty > available) {
        throw new ActionError(
          'CONFLICT',
          `${at}: 적치할 수 있는 수량(${qtyText(available)})보다 많습니다.`,
        )
      }
      // 동시에 같은 줄을 적치하는 경우: 조건부로 더해서 확정 수량을 넘지 않게
      const { count } = await tx.inboundReceiptLine.updateMany({
        where: { id: receiptLine.id, putawayQty: { lte: qtyText(total - qty) } },
        data: { putawayQty: { increment: qtyText(qty) } },
      })
      if (count !== 1)
        throw new ActionError('CONFLICT', '다른 사람이 먼저 적치했습니다. 새로 불러와 주세요.')
      await tx.asnLine.update({
        where: { id: receiptLine.asnLineId },
        data: { putawayQty: { increment: qtyText(qty) } },
      })

      const expiryOn = receiptLine.expiryOn?.toISOString().slice(0, 10) ?? null
      const moved = await moveStock(tx, {
        from: {
          locationId: receiptLine.stock.locationId,
          itemId: receiptLine.stock.itemId,
          lotNo: receiptLine.lotNo,
          expiryOn,
        },
        toLocationId: line.toLocationId,
        qty: qtyText(qty),
        ref: { refType: 'PUTAWAY', refId: asn.id, refNo: asn.asnNo },
      })
      const record = await tx.putaway.create({
        data: {
          operatorId,
          receiptLineId: receiptLine.id,
          asnId: asn.id,
          itemId: receiptLine.stock.itemId,
          fromLocationId: receiptLine.stock.locationId,
          toLocationId: line.toLocationId,
          lotNo: receiptLine.lotNo,
          expiryOn: receiptLine.expiryOn,
          qty: qtyText(qty),
          txnGroupId: moved.groupId,
          createdBy: currentActor(),
        },
        select: { id: true },
      })
      created.push(record.id)
    }
    const putawayStatus = await refreshPutawayStatus(tx, asn.id)
    return { count: created.length, putawayStatus }
  })
}
