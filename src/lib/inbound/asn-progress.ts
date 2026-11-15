import { parseQty, qtyText } from '@/lib/units/convert'

// ASN 라인 진행 계산 (0003 결정 5) — 화면·서버 공용, 순수 함수. 저장하지 않고 계산한다
// 잔량 = max(예정 − 누적 확정 − 마감, 0), 초과 = max(누적 확정 − 예정, 0), 적치 가능 = 누적 확정 − 누적 적치
// (마감 수량: 잔량 마감으로 더 받지 않기로 한 수량 — 마감 후 잔량은 0)

type Qty = string | { toString(): string }

export function lineProgress(line: {
  expectedQty: Qty
  confirmedQty: Qty
  putawayQty: Qty
  closedQty: Qty
}) {
  const expected = parseQty(line.expectedQty.toString())
  const confirmed = parseQty(line.confirmedQty.toString())
  const putaway = parseQty(line.putawayQty.toString())
  const closed = parseQty(line.closedQty.toString())
  const remaining = expected - confirmed - closed
  const over = confirmed - expected
  return {
    expectedQty: qtyText(expected),
    confirmedQty: qtyText(confirmed),
    remainingQty: qtyText(remaining > 0n ? remaining : 0n),
    overQty: qtyText(over > 0n ? over : 0n),
    putawayQty: qtyText(putaway),
    putawayableQty: qtyText(confirmed - putaway),
    closedQty: qtyText(closed),
  }
}
