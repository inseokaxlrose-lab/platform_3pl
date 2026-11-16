import { z } from 'zod'
import { idField } from '@/lib/id'
import { positiveQtyField } from './asn-schema'

// 적치 입력 규칙 — 화면·서버 공용 (docs/decisions/0058)
// 입고확정 라인마다 보낼 로케이션과 수량(기본단위). 남은 수량 중 일부만도 된다 (부분 적치)

export const putawaySchema = z.object({
  asnId: idField('ASN을 골라 주세요.'),
  lines: z
    .array(
      z.object({
        receiptLineId: idField('입고확정 줄을 골라 주세요.'),
        toLocationId: idField('적치할 로케이션을 골라 주세요.'),
        qty: positiveQtyField('적치 수량을 0보다 크게 넣어 주세요.'),
      }),
    )
    .min(1, '적치할 줄을 하나 이상 넣어 주세요.')
    .max(500),
})

export type PutawayInput = z.input<typeof putawaySchema>
export type PutawayData = z.output<typeof putawaySchema>
