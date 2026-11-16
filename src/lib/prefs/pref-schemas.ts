import { z } from 'zod'

// 사용자 개인 설정의 키와 값 규칙 (docs/decisions/0056) — 화면·서버 공용
// 새 설정은 여기에 키와 규칙을 더한다 (정하지 않은 키는 저장하지 않는다)

export const PREF_SCHEMAS = {
  // 라벨 인쇄: 단위별로 마지막에 고른 양식, 코드 종류
  'label-print': z.object({
    templates: z.object({
      PLT: z.enum(['PLT_A', 'PLT_B']),
      BOX: z.enum(['BOX_A', 'BOX_B']),
    }),
    codeType: z.enum(['QR', 'DATAMATRIX']),
  }),
} as const

export type PrefKey = keyof typeof PREF_SCHEMAS
export type PrefValue<K extends PrefKey> = z.output<(typeof PREF_SCHEMAS)[K]>

export const PREF_DEFAULTS: { [K in PrefKey]: PrefValue<K> } = {
  'label-print': { templates: { PLT: 'PLT_A', BOX: 'BOX_A' }, codeType: 'QR' },
}
