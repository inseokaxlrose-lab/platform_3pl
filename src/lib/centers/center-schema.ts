import { z } from 'zod'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import {
  addressShape,
  optionalPhone,
  optionalText,
  requiredText,
  userCodeField,
} from '@/lib/validation/common-fields'

// 센터 입력 규칙 — 화면·서버 공용 (docs/decisions/0026)

export const centerSchema = z.object({
  // 사용자 코드: 비우면 시스템 코드로 채운다
  code: userCodeField('센터 코드'),
  name: requiredText('센터명을 입력해 주세요.', 50),
  phone: optionalPhone,
  fax: optionalPhone,
  managerName: optionalText(30),
  managerPhone: optionalPhone,
  ...addressShape,
  externalCodes: externalCodesSchema,
})

export type CenterInput = z.input<typeof centerSchema>
export type CenterData = z.output<typeof centerSchema>
