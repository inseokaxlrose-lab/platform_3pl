import { z } from 'zod'
import { EXTERNAL_SYSTEM_KEYS, type ExternalSystemKey } from '@/config/external-systems'

// 외부 코드 입력 규칙 (화면·서버 공용, docs/decisions/0025)
// 연동 상대마다 한 칸, 비우면 매핑 삭제. 앞뒤 공백 제거, 50자 이하

export type ExternalCodes = Record<ExternalSystemKey, string>

export const externalCodesSchema = z.object(
  Object.fromEntries(
    EXTERNAL_SYSTEM_KEYS.map((key) => [
      key,
      z.string().trim().max(50, '50자 이하로 입력해 주세요.').default(''),
    ]),
  ) as Record<ExternalSystemKey, z.ZodDefault<z.ZodString>>,
)

export const EMPTY_EXTERNAL_CODES = Object.fromEntries(
  EXTERNAL_SYSTEM_KEYS.map((key) => [key, '']),
) as ExternalCodes
