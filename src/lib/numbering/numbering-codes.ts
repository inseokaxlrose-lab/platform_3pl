import { codeSet } from '@/config/operator-codes'

// 체번 규칙 값과 번호 모양 (docs/decisions/0084) — 화면·서버 공용, 순수 함수
// 값 목록은 DB 검사 조건(마이그레이션 _numbering)과 같아야 한다

// 대상: 기준정보 코드(마스터)와 업무 문서 번호(전표)
export const NUMBERING_TARGET = codeSet({
  SHIPPER: '화주사',
  CUSTOMER: '거래처',
  SHIP_TO: '납품처',
  ITEM: '품목',
  ASN: '입고예정(ASN)',
  RECEIPT: '입고확정',
  LABEL: '관리 라벨',
  ADJUST: '실사·조정',
})
export type NumberingTarget = (typeof NUMBERING_TARGET.values)[number]

// 번호가 하나인 범위
export const NUMBERING_SCOPE = codeSet({
  OPERATOR: '운영사',
  SHIPPER: '화주사',
  CUSTOMER: '거래처',
})
export type NumberingScope = (typeof NUMBERING_SCOPE.values)[number]

// 접두어 출처
export const PREFIX_SOURCE = codeSet({
  FIXED: '고정 문자',
  SHIPPER_PREFIX: '화주 코드 접두어',
  PARENT_CD: '상위 코드',
})
export type PrefixSource = (typeof PREFIX_SOURCE.values)[number]

export const DATE_FORMAT = codeSet({ NONE: '없음', YYMMDD: 'YYMMDD' })
export const RESET_CYCLE = codeSet({ NONE: '계속', DAY: '매일', MONTH: '매월', YEAR: '매년' })
export type ResetCycle = (typeof RESET_CYCLE.values)[number]

// 번호를 만드는 데 필요한 규칙 칸 (tb_numbering_rule)
export type NumberingRuleSpec = {
  target: NumberingTarget
  scope: NumberingScope
  prefixSource: PrefixSource
  fixedPrefix: string | null
  typeChar: string | null
  separator: string | null
  dateFormat: string
  seqLength: number
  resetCycle: string
}

// 운영사 타임존의 날짜 조각 (YY·MM·DD)
function dateParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { yy: get('year'), mm: get('month'), dd: get('day') }
}

// 일련번호 초기화 주기 키: NONE '-', DAY 'YYMMDD', MONTH 'YYMM', YEAR 'YY'
export function periodKeyOf(resetCycle: string, at: Date, timeZone: string) {
  if (resetCycle === 'NONE') return '-'
  const { yy, mm, dd } = dateParts(at, timeZone)
  return resetCycle === 'DAY' ? `${yy}${mm}${dd}` : resetCycle === 'MONTH' ? `${yy}${mm}` : yy
}

// 번호 앞부분 (일련번호 앞까지): 접두어 + 구분 문자 + 날짜 + 구분자
export function codeHead(rule: NumberingRuleSpec, prefix: string, at: Date, timeZone: string) {
  const date = rule.dateFormat === 'YYMMDD' ? periodKeyOf('DAY', at, timeZone) : ''
  return `${prefix}${rule.typeChar ?? ''}${date}${rule.separator ?? ''}`
}

// 번호 하나: 앞부분 + 0을 채운 일련번호 (자리수를 넘으면 길어진다 — 잘라 내지 않음)
export function formatCode(head: string, seq: bigint | number, seqLength: number) {
  return `${head}${String(seq).padStart(seqLength, '0')}`
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

// 자동 체번 모양 (직접 입력을 막을 때): 앞부분(날짜는 숫자 6자리) + 숫자 seqLength자리 이상
export function autoPatternOf(rule: NumberingRuleSpec, prefix: string) {
  const date = rule.dateFormat === 'YYMMDD' ? '\\d{6}' : ''
  return new RegExp(
    `^${escape(prefix)}${escape(rule.typeChar ?? '')}${date}${escape(rule.separator ?? '')}\\d{${rule.seqLength},}$`,
  )
}
