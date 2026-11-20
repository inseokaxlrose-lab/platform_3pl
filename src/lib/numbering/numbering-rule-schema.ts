import { z } from 'zod'
import { NUMBERING_TARGET, type NumberingTarget, type PrefixSource } from './numbering-codes'

// 체번 규칙 수정 입력 (docs/decisions/0085) — 화면·서버 공용
// 운영사는 "모양 칸"만 바꾼다: 고정 접두어·구분 문자·구분자·날짜·자리수·초기화 주기
// 번호 범위(scope)·접두어 출처(prefixSource)는 시스템이 정한 구조라 시스템 기본을 그대로 쓴다

// 대상별 코드 칸 길이 (DB VARCHAR) — 새 모양이 이 길이를 넘으면 저장할 수 없다
export const CODE_COLUMN_LENGTH: Record<NumberingTarget, number> = {
  SHIPPER: 20,
  CUSTOMER: 30,
  SHIP_TO: 40,
  ITEM: 50,
  ASN: 20,
  RECEIPT: 20,
  LABEL: 20,
  ADJUST: 20,
}

// 접두어 출처별 접두어 최대 길이 (화주 코드 접두어 2글자, 상위 코드 = 거래처코드 30자)
const PREFIX_MAX: Record<PrefixSource, number> = { FIXED: 5, SHIPPER_PREFIX: 2, PARENT_CD: 30 }

export const SEPARATORS = ['', '-', '_'] as const

export const numberingRuleSchema = z
  .object({
    target: z.enum(NUMBERING_TARGET.values, '대상을 골라 주세요.'),
    // 접두어 출처가 FIXED일 때만 (영문 대문자 1~5자)
    fixedPrefix: z.string().trim().toUpperCase(),
    // 엔티티 구분 문자 (영문 대문자 1자, 비우면 없음)
    typeChar: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === '' || /^[A-Z]$/.test(v), '구분 문자는 영문 대문자 1자입니다.'),
    separator: z.enum(SEPARATORS, '구분자를 골라 주세요.'),
    dateFormat: z.enum(['NONE', 'YYMMDD'], '날짜 형식을 골라 주세요.'),
    seqLength: z
      .number({ error: '자리수를 넣어 주세요.' })
      .int('자리수는 정수입니다.')
      .min(2, '자리수는 2~8입니다.')
      .max(8, '자리수는 2~8입니다.'),
    resetCycle: z.enum(['NONE', 'DAY', 'MONTH', 'YEAR'], '초기화 주기를 골라 주세요.'),
  })
  .superRefine((value, ctx) => {
    // 일련번호를 주기마다 1부터 다시 시작하면 번호에 날짜가 있어야 겹치지 않는다
    if (value.resetCycle !== 'NONE' && value.dateFormat !== 'YYMMDD') {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFormat'],
        message: '초기화 주기가 있으면 날짜(YYMMDD)를 넣어야 번호가 겹치지 않습니다.',
      })
    }
  })

export type NumberingRuleInput = z.input<typeof numberingRuleSchema>
export type NumberingRuleData = z.output<typeof numberingRuleSchema>

// 접두어 출처에 따른 추가 검사 + 코드 칸 길이 (서버·화면 공용 — 구조 칸은 시스템 기본에서 온다)
export function numberingRuleIssues(
  data: Pick<
    NumberingRuleData,
    'target' | 'fixedPrefix' | 'typeChar' | 'separator' | 'dateFormat' | 'seqLength'
  >,
  prefixSource: PrefixSource,
): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []
  if (prefixSource === 'FIXED' && !/^[A-Z]{1,5}$/.test(data.fixedPrefix)) {
    issues.push({ path: 'fixedPrefix', message: '고정 접두어는 영문 대문자 1~5자입니다.' })
  }
  const prefixLength = prefixSource === 'FIXED' ? data.fixedPrefix.length : PREFIX_MAX[prefixSource]
  const longest =
    prefixLength +
    data.typeChar.length +
    (data.dateFormat === 'YYMMDD' ? 6 : 0) +
    data.separator.length +
    data.seqLength
  const max = CODE_COLUMN_LENGTH[data.target]
  if (longest > max) {
    issues.push({
      path: 'seqLength',
      message: `번호가 최대 ${longest}자가 되어 코드 칸(${max}자)을 넘습니다. 자리수나 접두어를 줄여 주세요.`,
    })
  }
  return issues
}
