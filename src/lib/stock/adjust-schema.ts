import { z } from 'zod'
import { idField } from '@/lib/id'
import { optionalText } from '@/lib/validation/common-fields'

// 재고 실사·조정 입력 규칙 — 화면·서버 공용 (docs/decisions/0061)
// 실사(COUNT): 줄마다 센 수량(0 이상) / 조정(ADJUST): 줄마다 바꿀 수량(±, 0 아님). 수량은 기본단위, 사유 필수

export const ADJUST_TYPE_LABELS = { COUNT: '실사', ADJUST: '조정' } as const
export const ADJUST_STATUS_LABELS = { DRAFT: '등록', CONFIRMED: '확정', CANCELED: '취소' } as const
export const MAX_ADJUST_LINES = 500

const signedQty = /^-?\d+(\.\d{1,6})?$/

export const adjustSchema = z
  .object({
    type: z.enum(['COUNT', 'ADJUST'], '유형을 골라 주세요.'),
    centerId: idField('센터를 골라 주세요.'),
    reason: z
      .string()
      .trim()
      .min(1, '사유를 입력해 주세요.')
      .max(200, '200자 이하로 입력해 주세요.'),
    remark: optionalText(500),
    lines: z
      .array(
        z.object({
          stockId: idField('재고를 골라 주세요.'),
          qty: z
            .string()
            .trim()
            .refine((v) => signedQty.test(v), '수량을 숫자로 넣어 주세요.'),
        }),
      )
      .min(1, '줄을 하나 이상 넣어 주세요.')
      .max(MAX_ADJUST_LINES, `${MAX_ADJUST_LINES}줄까지입니다.`),
  })
  .superRefine((value, ctx) => {
    value.lines.forEach((line, index) => {
      if (value.type === 'COUNT' && line.qty.startsWith('-')) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'qty'],
          message: '센 수량은 0 이상입니다.',
        })
      }
      if (value.type === 'ADJUST' && !/[1-9]/.test(line.qty)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'qty'],
          message: '0이 아닌 수량을 넣어 주세요.',
        })
      }
    })
    const ids = value.lines.map((l) => l.stockId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: '같은 재고가 두 번 들어 있습니다.' })
    }
  })

export type AdjustInput = z.input<typeof adjustSchema>
export type AdjustData = z.output<typeof adjustSchema>
