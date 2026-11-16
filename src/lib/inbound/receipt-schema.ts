import { z } from 'zod'
import { idField } from '@/lib/id'
import { optionalText } from '@/lib/validation/common-fields'
import { positiveQtyField } from './asn-schema'

// 입고 확정 입력 규칙 — 화면·서버 공용 (docs/decisions/0057)
// 검수 기록마다 확정할 수량(기본단위). 검수된 수량 중 원하는 만큼만 (부분 확정)

export const receiptSchema = z.object({
  asnId: idField('ASN을 골라 주세요.'),
  lines: z
    .array(
      z.object({
        inspectionId: idField('검수 기록을 골라 주세요.'),
        qty: positiveQtyField('확정 수량을 0보다 크게 넣어 주세요.'),
      }),
    )
    .min(1, '확정할 수량을 하나 이상 넣어 주세요.')
    .max(500),
  remark: optionalText(200),
})

export type ReceiptInput = z.input<typeof receiptSchema>
export type ReceiptData = z.output<typeof receiptSchema>
