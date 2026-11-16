import { z } from 'zod'
import { optionalIdSchema } from '@/lib/id'

// 정산·보고용 자료 추출 (docs/decisions/0064) — 화면·서버 공용

export const REPORT_TYPES = {
  RECEIPTS: {
    label: '입고 실적',
    needsPeriod: true,
    note: '기간 안에 입고 확정한 품목별 수량 (확정 번호·ASN·로트별)',
  },
  MOVEMENT: {
    label: '기간 재고 수불',
    needsPeriod: true,
    note: '화주사·품목별 기초 재고 + 입고 + 조정(±) = 기말 재고 (보관료 정산 기초 자료)',
  },
  STOCK: {
    label: '현재 재고',
    needsPeriod: false,
    note: '지금 재고 (로케이션·로트별, 수량 0 제외)',
  },
} as const

export type ReportType = keyof typeof REPORT_TYPES

// 기간은 최대 1년 (큰 자료를 한 번에 만들지 않게)
export const MAX_REPORT_DAYS = 366

const day = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), '날짜 형식이 올바르지 않습니다.')

export const reportSchema = z
  .object({
    type: z.enum(['RECEIPTS', 'MOVEMENT', 'STOCK'], '자료를 골라 주세요.'),
    from: day,
    to: day,
    centerId: optionalIdSchema,
    shipperId: optionalIdSchema,
  })
  .superRefine((v, ctx) => {
    if (!REPORT_TYPES[v.type].needsPeriod) return
    if (!v.from || !v.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: '기간을 넣어 주세요.' })
      return
    }
    const days = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000
    if (days < 0)
      ctx.addIssue({ code: 'custom', path: ['to'], message: '종료일이 시작일보다 앞입니다.' })
    if (days >= MAX_REPORT_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `기간은 ${MAX_REPORT_DAYS}일까지입니다.`,
      })
    }
  })

export type ReportInput = z.input<typeof reportSchema>
export type ReportData = z.output<typeof reportSchema>
