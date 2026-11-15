import { describe, expect, it } from 'vitest'
import { lineProgress } from './asn-progress'

describe('ASN 라인 진행 계산 (0003 결정 5)', () => {
  it('잔량·초과·적치 가능', () => {
    expect(
      lineProgress({ expectedQty: '100', confirmedQty: '60', putawayQty: '20', closedQty: '0' }),
    ).toMatchObject({ remainingQty: '40', overQty: '0', putawayableQty: '40' })
    expect(
      lineProgress({ expectedQty: '100', confirmedQty: '120.5', putawayQty: '0', closedQty: '0' }),
    ).toMatchObject({ remainingQty: '0', overQty: '20.5', putawayableQty: '120.5' })
  })

  it('마감하면 잔량은 0, 마감 수량으로 남는다', () => {
    expect(
      lineProgress({ expectedQty: '100', confirmedQty: '70', putawayQty: '70', closedQty: '30' }),
    ).toMatchObject({ remainingQty: '0', closedQty: '30', putawayableQty: '0' })
  })
})
