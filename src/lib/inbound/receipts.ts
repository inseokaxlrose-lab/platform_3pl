import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { DEFAULT_LOCATION_CODE } from '@/lib/centers/center-defaults'
import { nextDocumentNumber } from '@/lib/documents/doc-no'
import type { Db } from '@/lib/prisma'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { checkQtyDecimals, parseQty, qtyText } from '@/lib/units/convert'
import type { ReceiptData } from './receipt-schema'

// 입고 확정 (docs/decisions/0057, 0003 결정 5)
// - 검수된 정상 수량 중 원하는 만큼만 확정 (여러 번 나눠서 — 확정할 때마다 입고확정 문서 하나)
// - 예정보다 많아도 확정한다 (초과 입고 허용, 화면이 확인을 받는다)
// - 확정 수량만큼 센터의 입고대기 창고 기본 로케이션에 재고가 생긴다 (재고 변경 공통 함수, 같은 트랜잭션)
// - 마감된 ASN은 확정할 수 없다. 끝나면 ASN 상태: 모든 줄 누적 확정 ≥ 예정 → 확정완료, 아니면 부분확정

// 센터의 입고대기 창고 기본 로케이션 (센터 등록 때 자동으로 만들어진다, 0026)
async function stagingLocationId(db: Db, centerId: bigint) {
  const location = await db.location.findFirst({
    where: {
      code: DEFAULT_LOCATION_CODE,
      warehouse: { centerId, type: 'INBOUND_STAGING', delYn: 'N' },
    },
    select: { id: true },
  })
  if (!location) {
    throw new ActionError(
      'CONFLICT',
      '이 센터에 입고대기 창고의 기본 로케이션이 없습니다. 관리자에게 알려 주세요.',
    )
  }
  return location.id
}

export async function confirmReceipt(data: ReceiptData) {
  const operatorId = requireOperatorId()
  // 같은 검수 기록이 두 번 들어오면 하나로 합친다
  const merged = new Map<bigint, bigint>()
  for (const line of data.lines) {
    merged.set(line.inspectionId, (merged.get(line.inspectionId) ?? 0n) + parseQty(line.qty))
  }

  return stockTransaction(async (tx) => {
    const asn = await tx.asn.findUnique({
      where: { id: data.asnId },
      select: { id: true, status: true, centerId: true },
    })
    if (!asn) throw new ActionError('NOT_FOUND', 'ASN을 찾을 수 없습니다.')
    if (asn.status === 'CLOSED')
      throw new ActionError('CONFLICT', '마감된 ASN은 확정할 수 없습니다.')
    if (asn.status === 'PLANNED') {
      throw new ActionError('CONFLICT', '검수가 없는 ASN입니다. 먼저 검수해 주세요.')
    }
    const locationId = await stagingLocationId(tx, asn.centerId)

    const inspections = await tx.inboundInspection.findMany({
      where: { id: { in: [...merged.keys()] }, asnId: asn.id },
      select: {
        id: true,
        asnLineId: true,
        itemId: true,
        lotNo: true,
        expiryOn: true,
        inspectedQty: true,
        confirmedQty: true,
        item: { select: { code: true, baseUnit: { select: { code: true, decimals: true } } } },
      },
    })
    if (inspections.length !== merged.size) {
      throw new ActionError('NOT_FOUND', '이 ASN의 검수 기록이 아닌 것이 섞여 있습니다.')
    }

    const receiptNo = await nextDocumentNumber('RECEIPT', tx)
    const receipt = await tx.inboundReceipt.create({
      data: {
        operatorId,
        asnId: asn.id,
        receiptNo,
        confirmedBy: currentActor(),
        remark: data.remark,
      },
      select: { id: true, receiptNo: true },
    })

    for (const inspection of inspections) {
      const qty = merged.get(inspection.id)!
      const text = qtyText(qty)
      const unit = inspection.item.baseUnit
      if (!checkQtyDecimals(text, unit.decimals)) {
        throw new ActionError(
          'VALIDATION',
          `${inspection.item.code}: ${unit.code} 수량은 소수 ${unit.decimals}자리까지입니다.`,
        )
      }
      const inspected = parseQty(inspection.inspectedQty.toString())
      const available = inspected - parseQty(inspection.confirmedQty.toString())
      if (qty > available) {
        throw new ActionError(
          'CONFLICT',
          `${inspection.item.code}: 확정할 수 있는 수량(${qtyText(available)} ${unit.code})보다 많습니다.`,
        )
      }
      // 동시에 같은 검수를 확정하는 경우: 조건부로 더해서 검수 수량을 넘지 않게 (넘으면 0건 → 거부)
      const { count } = await tx.inboundInspection.updateMany({
        where: { id: inspection.id, confirmedQty: { lte: qtyText(inspected - qty) } },
        data: { confirmedQty: { increment: text } },
      })
      if (count !== 1) {
        throw new ActionError('CONFLICT', '다른 사람이 먼저 확정했습니다. 새로 불러와 주세요.')
      }

      const stock = await receiveStock(tx, {
        address: {
          locationId,
          itemId: inspection.itemId,
          lotNo: inspection.lotNo,
          expiryOn: inspection.expiryOn?.toISOString().slice(0, 10) ?? null,
        },
        qty: text,
        ref: { refType: 'RECEIPT', refId: receipt.id, refNo: receipt.receiptNo },
      })
      await tx.inboundReceiptLine.create({
        data: {
          operatorId,
          receiptId: receipt.id,
          asnLineId: inspection.asnLineId,
          inspectionId: inspection.id,
          stockId: stock.stockId,
          stockTxnId: stock.txnId,
          lotNo: inspection.lotNo,
          expiryOn: inspection.expiryOn,
          qty: text,
        },
      })
      await tx.asnLine.update({
        where: { id: inspection.asnLineId },
        data: { confirmedQty: { increment: text } },
      })
    }

    // ASN 상태: 모든 줄 누적 확정 ≥ 예정 → 확정완료, 아니면 부분확정
    const lines = await tx.asnLine.findMany({
      where: { asnId: asn.id },
      select: { expectedQty: true, confirmedQty: true },
    })
    const done = lines.every(
      (l) => parseQty(l.confirmedQty.toString()) >= parseQty(l.expectedQty.toString()),
    )
    await tx.asn.update({
      where: { id: asn.id },
      data: { status: done ? 'COMPLETED' : 'PARTIAL' },
    })
    return { id: receipt.id, receiptNo: receipt.receiptNo, status: done ? 'COMPLETED' : 'PARTIAL' }
  })
}
