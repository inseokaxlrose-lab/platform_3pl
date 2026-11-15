import { z } from 'zod'
import { contactsSchema } from '@/lib/contacts/contact-schema'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import {
  addressShape,
  optionalBusinessNumber,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
  userCodeField,
} from '@/lib/validation/common-fields'
import { idSchema } from '@/lib/id'

// 화주사 입력 규칙 — 화면·서버 공용 (docs/decisions/0035)

export const LABEL_UNITS = ['PLT', 'BOX'] as const
export type LabelUnitValue = (typeof LABEL_UNITS)[number]

export const shipperSchema = z.object({
  // 사용자 코드: 전체에서 중복 금지, 비우면 시스템 코드
  code: userCodeField('화주사 코드'),
  name: requiredText('화주사명을 입력해 주세요.', 100),
  businessNumber: optionalBusinessNumber,
  ceoName: optionalText(30),
  businessType: optionalText(50),
  businessItem: optionalText(50),
  phone: optionalPhone,
  fax: optionalPhone,
  email: optionalEmail,
  ...addressShape,
  // 이용 센터: 1곳 이상 (입고 받을 센터가 있어야 한다)
  centerIds: z
    .array(idSchema)
    .min(1, '이용 센터를 1곳 이상 골라 주세요.')
    .max(50)
    .transform((ids) => [...new Set(ids)]),
  // 품목 기본값 (품목에서 그대로 쓰거나 개별 지정, 0003)
  useLot: z.boolean(),
  useExpiry: z.boolean(),
  labelUnit: z.enum(LABEL_UNITS, '라벨 단위를 골라 주세요.'),
  contacts: contactsSchema,
  externalCodes: externalCodesSchema,
})

export type ShipperInput = z.input<typeof shipperSchema>
export type ShipperData = z.output<typeof shipperSchema>
