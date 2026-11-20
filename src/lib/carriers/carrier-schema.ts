import { z } from 'zod'
import { oneOf, optionalPhone, optionalText, requiredText } from '@/lib/validation/common-fields'
import { CARRIER_STATUS, CARRIER_TYPE, INVOICE_CHECK_RULE } from './carrier-codes'

// 운송사 입력 규칙 — 화면·서버 공용 (docs/decisions/0094)
// 우리 코드는 필수(택배사 약칭이 곧 연동에서 주고받는 키, 단위·팔레트 코드와 같음)·등록 후 불변

export const carrierCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, '운송사 코드를 입력해 주세요.')
  .max(20, '20자 이하로 입력해 주세요.')
  .regex(/^[A-Z0-9_-]+$/, '코드는 영문·숫자·하이픈·밑줄입니다.')

// 송장 자릿수 (선택): 4~20, 비우면 null
const invoiceDigitsField = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === '' || (/^\d{1,2}$/.test(value) && Number(value) >= 4 && Number(value) <= 20),
    '송장 자릿수는 4~20 사이 숫자입니다.',
  )
  .transform((value) => (value === '' ? null : Number(value)))

// 배송 조회 주소 (선택): http(s) 주소, {invoiceNo} 자리에 송장번호가 들어간다
const trackingUrlField = z
  .string()
  .trim()
  .max(300, '300자 이하로 입력해 주세요.')
  .refine(
    (value) => value === '' || /^https?:\/\/\S+$/.test(value),
    'http:// 또는 https://로 시작하는 주소입니다.',
  )
  .refine(
    (value) => value === '' || value.includes('{invoiceNo}'),
    '송장번호가 들어갈 자리에 {invoiceNo}를 넣어 주세요.',
  )
  .transform((value) => value || null)

const shape = {
  custCode: optionalText(50),
  name: requiredText('운송사명을 입력해 주세요.', 50),
  carrierType: oneOf(CARRIER_TYPE.values, '운송 유형을 골라 주세요.'),
  invoiceDigits: invoiceDigitsField,
  invoiceCheck: oneOf(INVOICE_CHECK_RULE.values, '체크디지트 규칙을 골라 주세요.'),
  trackingUrl: trackingUrlField,
  tel: optionalPhone,
  status: oneOf(CARRIER_STATUS.values, '상태를 골라 주세요.'),
  sortOrder: z.number().int().min(0).max(9999),
  remark: optionalText(1000),
}

// 체크디지트가 있으면 자릿수도 필요하다 (본번호 자릿수를 알아야 대역을 검사할 수 있다)
const digitsRule = (
  value: { invoiceCheck: string; invoiceDigits: number | null },
  ctx: z.RefinementCtx,
) => {
  if (value.invoiceCheck !== 'NONE' && value.invoiceDigits === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['invoiceDigits'],
      message: '체크디지트 규칙을 쓰면 송장 자릿수도 넣어 주세요.',
    })
  }
}

export const carrierSchema = z.object(shape).superRefine(digitsRule)
export const carrierCreateSchema = z
  .object({ code: carrierCodeField, ...shape })
  .superRefine(digitsRule)

export type CarrierInput = z.input<typeof carrierSchema>
export type CarrierData = z.output<typeof carrierSchema>
export type CarrierCreateInput = z.input<typeof carrierCreateSchema>
export type CarrierCreateData = z.output<typeof carrierCreateSchema>
