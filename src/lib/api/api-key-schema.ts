import { z } from 'zod'
import { idSchema } from '@/lib/id'
import { oneOf, optionalDateText, optionalText, requiredText } from '@/lib/validation/common-fields'
import { API_ENV, API_SCOPE, DEFAULT_RATE_LIMIT } from './api-codes'
import { isValidCidr } from './ip-allow'

// API 키 발급·수정 입력 규칙 — 화면·서버 공용 (docs/decisions/0081)

const ipRow = z.object({
  ipCidr: z
    .string()
    .trim()
    .min(1, 'IP를 입력해 주세요.')
    .refine(isValidCidr, 'IP 또는 CIDR 형식이 아닙니다. (예: 203.0.113.10, 203.0.113.0/24)'),
  description: optionalText(100),
})

const keyShape = {
  name: requiredText('키 이름을 입력해 주세요. (예: ERP 연동용)', 50),
  scopes: z
    .array(oneOf(API_SCOPE.values, '알 수 없는 권한입니다.'))
    .min(1, '권한을 하나 이상 골라 주세요.')
    .transform((scopes) => [...new Set(scopes)]),
  ips: z
    .array(ipRow)
    .max(20, '허용 IP는 20개까지입니다.')
    .refine(
      (rows) => new Set(rows.map((r) => r.ipCidr)).size === rows.length,
      '같은 IP가 두 번 있습니다.',
    ),
  // 만료일 (비우면 무기한) — 그날 23:59:59(한국 시간)까지 쓸 수 있다
  expiresOn: optionalDateText,
  rateLimitPerMin: z
    .number()
    .int('정수로 입력해 주세요.')
    .min(1, '1 이상입니다.')
    .max(6000, '6000 이하입니다.'),
}

// 발급: 환경까지 (환경은 나중에 바꿀 수 없다 — 키 글자에 들어 있다)
export const apiKeyIssueSchema = z.object({
  shipperId: idSchema,
  env: oneOf(API_ENV.values, '환경을 골라 주세요.'),
  ...keyShape,
})

// 수정: 이름·권한·IP·만료일·호출 한도
export const apiKeyUpdateSchema = z.object(keyShape)

// 폐기: 사유 필수
export const apiKeyRevokeSchema = z.object({
  reason: requiredText('폐기 사유를 입력해 주세요.', 200),
})

export type ApiKeyIssueInput = z.input<typeof apiKeyIssueSchema>
export type ApiKeyIssueData = z.output<typeof apiKeyIssueSchema>
export type ApiKeyUpdateInput = z.input<typeof apiKeyUpdateSchema>
export type ApiKeyUpdateData = z.output<typeof apiKeyUpdateSchema>

export const EMPTY_API_KEY_FORM = {
  name: '',
  scopes: [] as string[],
  ips: [] as { ipCidr: string; description: string }[],
  expiresOn: '',
  rateLimitPerMin: DEFAULT_RATE_LIMIT,
}

// 만료일 'YYYY-MM-DD' → 그날 끝(한국 시간 23:59:59.999)
export const endOfKstDay = (day: string) => new Date(`${day}T23:59:59.999+09:00`)
