import { z } from 'zod'
import { STOCK_STATUS } from '@/config/operator-codes'
import { idField } from '@/lib/id'

// 재고상태 변경 입력 (0088) — 화면·서버 공용
// 수량을 비우면 가용 수량 전부. 정상이 아닌 상태로 바꿀 때는 사유(HOLD_REASON) 필수
export const stockStatusChangeSchema = z
  .object({
    stockId: idField('재고를 골라 주세요.'),
    toStatus: z.enum(STOCK_STATUS.values, '바꿀 재고상태를 골라 주세요.'),
    qty: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || /^\d+(\.\d{1,6})?$/.test(v),
        '수량은 0보다 큰 숫자로 넣어 주세요.',
      ),
    reasonCd: z.string().trim().max(20).default(''),
    reason: z.string().trim().max(200, '200자 이하로 입력해 주세요.').default(''),
  })
  .refine((v) => v.toStatus === 'NORMAL' || v.reasonCd !== '', {
    message: '보류·불량·격리로 바꿀 때는 사유를 골라 주세요.',
    path: ['reasonCd'],
  })

export type StockStatusChangeInput = z.input<typeof stockStatusChangeSchema>
export type StockStatusChangeData = z.output<typeof stockStatusChangeSchema>
