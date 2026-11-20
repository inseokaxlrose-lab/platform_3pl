import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { qtyText, parseQty } from '@/lib/units/convert'
import { changeStockStatus, type StockStatus } from './stock-change'
import type { StockStatusChangeData } from './stock-status-schema'
import { STOCK_SCOPE } from './stock-list'
import { stockTransaction } from './stock-transaction'

// 재고상태 변경 (0088): 재고 줄 하나의 일부(또는 전부)를 다른 상태로
// - 데이터 범위 안의 재고만 (센터 직원은 소속 센터, 화주사 사용자는 불가)
// - 정상이 아닌 상태로 바꿀 때 사유(공통코드 HOLD_REASON) 필수 — 코드 검사는 여기서
// - 수량·할당 검사, 이력 두 줄은 재고 변경 공통 함수(changeStockStatus)가 한다
export async function changeStatusOfStock(data: StockStatusChangeData, scope: DataScope) {
  if (scope.kind === 'SHIPPER') {
    throw new ActionError('FORBIDDEN', '화주사 사용자는 재고상태를 바꿀 수 없습니다.')
  }
  const stock = await prisma.stock.findFirst({
    where: { AND: [{ id: data.stockId }, scopeFilter(scope, STOCK_SCOPE)] },
    select: {
      locationId: true,
      itemId: true,
      lotNo: true,
      expiryOn: true,
      status: true,
      qty: true,
      allocatedQty: true,
    },
  })
  if (!stock) throw new ActionError('NOT_FOUND', '재고를 찾을 수 없습니다.')
  // 수량을 비우면 가용 수량 전부 (수량 − 할당)
  const qty =
    data.qty || qtyText(parseQty(stock.qty.toString()) - parseQty(stock.allocatedQty.toString()))
  return stockTransaction(async (tx) => {
    if (data.reasonCd) {
      await assertCodeValues(tx, 'HOLD_REASON', [data.reasonCd], { label: '보류 사유' })
    }
    const result = await changeStockStatus(tx, {
      address: {
        locationId: stock.locationId,
        itemId: stock.itemId,
        lotNo: stock.lotNo,
        expiryOn: stock.expiryOn?.toISOString().slice(0, 10) ?? null,
        status: stock.status as StockStatus,
      },
      toStatus: data.toStatus,
      qty,
      reasonCd: data.reasonCd || null,
      reason: data.reason,
    })
    return { stockId: result.in.stockId, qty }
  })
}
