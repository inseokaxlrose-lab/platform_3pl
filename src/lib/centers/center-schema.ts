import { z } from 'zod'
import { SYSTEM_CODE_TYPES, USER_CODE_PATTERN } from '@/config/master-codes'
import { externalCodesSchema } from '@/lib/master-code/external-codes-schema'
import {
  addressShape,
  optionalPhone,
  optionalText,
  requiredText,
} from '@/lib/validation/common-fields'

// 센터 입력 규칙 — 화면·서버 공용 (docs/decisions/0026)

// 시스템 코드 모양 (CT + 6자리): 사용자 코드로는 쓸 수 없다 (자기 시스템 코드 제외)
// 이유: 코드를 비워 등록한 센터가 시스템 코드를 사용자 코드로 받을 때 겹치지 않게
export const CENTER_SYSTEM_CODE_PATTERN = new RegExp(
  `^${SYSTEM_CODE_TYPES.CENTER.prefix}\\d{${SYSTEM_CODE_TYPES.CENTER.digits}}$`,
)

export const centerSchema = z.object({
  // 사용자 코드: 비우면 시스템 코드로 채운다. 소문자는 대문자로
  code: z
    .string()
    .trim()
    .toUpperCase()
    .max(20, '20자 이하로 입력해 주세요.')
    .refine(
      (value) => value === '' || (value.length >= 2 && USER_CODE_PATTERN.test(value)),
      '센터 코드는 영문·숫자·하이픈·밑줄 2~20자입니다.',
    ),
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
