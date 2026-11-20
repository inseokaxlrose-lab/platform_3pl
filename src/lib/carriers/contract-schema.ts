import { z } from 'zod'
import { idField, optionalIdSchema } from '@/lib/id'
import { oneOf, optionalDateText, optionalText, requiredText } from '@/lib/validation/common-fields'
import { CARRIER_STATUS } from './carrier-codes'

// 운송 계약 입력 규칙 — 화면·서버 공용 (docs/decisions/0094)
// 송장 대역은 체크디지트를 뺀 본번호. 자릿수·체크디지트 검사는 운송사 규칙을 아는 서버(contracts.ts)가 한다

// 본번호 (선택): 숫자만, 하이픈·띄어쓰기는 받아서 지운다
const optionalBody = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => value === '' || /^\d{1,19}$/.test(value), '숫자만 19자리까지 입력합니다.')
  .transform((value) => value || null)

const big = (value: string) => BigInt(value)

export const contractSchema = z
  .object({
    carrierId: idField('운송사를 골라 주세요.'),
    centerId: idField('센터를 골라 주세요.'),
    // 비우면 센터 공용 계약
    shipperId: optionalIdSchema,
    custNo: requiredText('택배사 고객코드를 입력해 주세요.', 30),
    pickupBranch: optionalText(50),
    invoiceStart: optionalBody,
    invoiceEnd: optionalBody,
    invoiceNext: optionalBody,
    isDefault: z.boolean(),
    validFrom: optionalDateText,
    validTo: optionalDateText,
    status: oneOf(CARRIER_STATUS.values, '상태를 골라 주세요.'),
    remark: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    const { invoiceStart: start, invoiceEnd: end, invoiceNext: next } = value
    // 대역은 시작·끝을 함께 (다음 번호만 따로 넣을 수 없다)
    if ((start === null) !== (end === null)) {
      ctx.addIssue({
        code: 'custom',
        path: [start === null ? 'invoiceStart' : 'invoiceEnd'],
        message: '송장 대역은 시작 번호와 끝 번호를 함께 넣어 주세요.',
      })
    } else if (start !== null && end !== null) {
      if (start.length !== end.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoiceEnd'],
          message: '시작 번호와 끝 번호의 자릿수가 같아야 합니다.',
        })
      } else if (big(start) > big(end)) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoiceEnd'],
          message: '끝 번호는 시작 번호보다 작을 수 없습니다.',
        })
      } else if (
        next !== null &&
        (next.length !== start.length || big(next) < big(start) || big(next) > big(end) + 1n)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoiceNext'],
          message: '다음 번호는 대역 안(시작 ~ 끝+1)이어야 합니다.',
        })
      }
    } else if (next !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['invoiceNext'],
        message: '송장 대역(시작·끝)을 먼저 넣어 주세요.',
      })
    }
    if (value.validFrom && value.validTo && value.validFrom > value.validTo) {
      ctx.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: '종료일은 시작일보다 빠를 수 없습니다.',
      })
    }
  })

export type ContractInput = z.input<typeof contractSchema>
export type ContractData = z.output<typeof contractSchema>
