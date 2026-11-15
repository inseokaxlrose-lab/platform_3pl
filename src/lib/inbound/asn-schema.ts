import { z } from 'zod'
import { idField } from '@/lib/id'
import { optionalText } from '@/lib/validation/common-fields'

// ASN 입력 규칙 — 화면·서버 공용 (docs/decisions/0047·0048)
// 수량은 글자로 ('3', '2.5'), 기본단위 환산·소수 자리 검사는 서버가 품목 단위를 보고 한다 (convert.ts)

export const MAX_ASN_LINES = 200

// 'YYYY-MM-DD' 실제 날짜
const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const requiredDate = (message: string) => z.string().trim().refine(isDate, message)

export const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === '' || isDate(value), '날짜 형식이 올바르지 않습니다.')
  .transform((value) => value || null)

// 수량 글자: 0보다 큰 수, 소수 6자리까지 (단위별 소수 자리는 서버가 다시 본다)
export const positiveQtyField = (message = '수량을 0보다 크게 입력해 주세요.') =>
  z
    .string()
    .trim()
    .refine((value) => /^\d+(\.\d{1,6})?$/.test(value) && /[1-9]/.test(value), message)

export const asnLineSchema = z.object({
  itemId: idField('품목을 골라 주세요.'),
  // 입력 단위: 품목의 기본단위 코드 또는 환산단위 코드 (예: EA, BOX)
  unit: z.string().trim().min(1, '단위를 골라 주세요.'),
  qty: positiveQtyField(),
  lotNo: optionalText(50),
  expiryOn: optionalDate,
  remark: optionalText(200),
})

const asnShape = {
  centerId: idField('센터를 골라 주세요.'),
  expectedOn: requiredDate('입고 예정일을 입력해 주세요.'),
  shipperRefNo: optionalText(50),
  remark: optionalText(1000),
  lines: z
    .array(asnLineSchema)
    .min(1, '품목을 한 줄 이상 넣어 주세요.')
    .max(MAX_ASN_LINES, `품목은 ${MAX_ASN_LINES}줄까지입니다.`),
}

// 수정: 화주사는 바꿀 수 없다
export const asnSchema = z.object(asnShape)
// 등록: 화주사를 고른다 (화주 포털은 서버가 자기 화주사로 정한다)
export const asnCreateSchema = z.object({
  shipperId: idField('화주사를 골라 주세요.'),
  ...asnShape,
})

export type AsnInput = z.input<typeof asnSchema>
export type AsnData = z.output<typeof asnSchema>
export type AsnCreateInput = z.input<typeof asnCreateSchema>
export type AsnCreateData = z.output<typeof asnCreateSchema>
export type AsnLineInput = z.input<typeof asnLineSchema>

export const EMPTY_ASN_LINE: AsnLineInput = {
  itemId: '',
  unit: '',
  qty: '',
  lotNo: '',
  expiryOn: '',
  remark: '',
}

// 화면 표시 이름표
export const ASN_STATUS_LABELS = {
  PLANNED: '예정',
  INSPECTING: '검수중',
  PARTIAL: '부분확정',
  COMPLETED: '확정완료',
  CLOSED: '마감',
} as const
export const PUTAWAY_STATUS_LABELS = {
  WAITING: '적치대기',
  PARTIAL: '부분적치',
  DONE: '적치완료',
} as const
export const ASN_CHANNEL_LABELS = {
  PORTAL: '화주 포털',
  PROXY: '센터 대리',
  EXCEL: '엑셀 업로드',
} as const
export const INBOUND_TYPE_LABELS = { SHIPPER: '화주사입고', TRANSFER: '수송입고' } as const
