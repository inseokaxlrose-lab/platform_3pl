import { z } from 'zod'
import { LOCATION_BULK_MAX } from '@/config/locations'

// 로케이션 코드 규칙·일괄 생성 패턴 (docs/decisions/0028, 0075) — 화면 미리보기·서버 공용 순수 함수
// 패턴 토큰 {ZONE} {ROW} {BAY} {LEVEL} {CELL} 을 범위 값으로 바꿔 코드를 만든다
//   예: '{ZONE}-{ROW}-{LEVEL}', 구역 A, 열 1~2(2자리), 단 1~3(2자리) → A-01-01 … A-02-03

// 로케이션 코드: 영문 대문자·숫자·하이픈 1~30자 (소문자는 대문자로)
export const LOCATION_CODE_PATTERN = /^[A-Z0-9-]{1,30}$/

export const locationCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (value) => LOCATION_CODE_PATTERN.test(value),
    '로케이션 코드는 영문·숫자·하이픈 1~30자입니다.',
  )

export const PATTERN_TOKENS = ['ZONE', 'ROW', 'BAY', 'LEVEL', 'CELL'] as const
export type PatternToken = (typeof PATTERN_TOKENS)[number]
const TOKEN_LABEL: Record<PatternToken, string> = {
  ZONE: '구역',
  ROW: '열',
  BAY: '연',
  LEVEL: '단',
  CELL: '칸',
}

// 패턴에 쓰인 토큰 (모르는 토큰이 있으면 null)
export function patternTokens(pattern: string): PatternToken[] | null {
  const found = [...pattern.matchAll(/\{([A-Z]+)\}/g)].map((m) => m[1])
  if (found.some((t) => !(PATTERN_TOKENS as readonly string[]).includes(t))) return null
  return found as PatternToken[]
}

// 숫자 범위 하나 (열·연·단·칸)
const rangePart = z.object({
  from: z.number().int('정수로 입력해 주세요.').min(0, '0 이상입니다.').max(999, '999 이하입니다.'),
  to: z.number().int('정수로 입력해 주세요.').min(0, '0 이상입니다.').max(999, '999 이하입니다.'),
  digits: z.number().int().min(1).max(3),
})
export type RangePart = z.output<typeof rangePart>

export const locationPatternSchema = z
  .object({
    // 구역코드 ({ZONE} 자리, 서버가 고른 구역의 코드로 채운다)
    zoneCode: z.string().trim().toUpperCase(),
    pattern: z.string().trim().min(1, '코드 패턴을 입력해 주세요.').max(60),
    row: rangePart,
    level: rangePart,
    // 연·칸은 쓸 때만
    bay: rangePart.nullable(),
    cell: rangePart.nullable(),
  })
  .superRefine((value, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    const tokens = patternTokens(value.pattern)
    if (!tokens) {
      issue(['pattern'], '패턴에는 {ZONE} {ROW} {BAY} {LEVEL} {CELL} 만 쓸 수 있습니다.')
      return
    }
    // 범위가 둘 이상인 칸은 패턴에 있어야 코드가 겹치지 않는다
    const parts = { row: value.row, level: value.level, bay: value.bay, cell: value.cell }
    for (const [key, part] of Object.entries(parts)) {
      if (!part) continue
      const token = key.toUpperCase() as PatternToken
      if (part.from > part.to) issue([key, 'to'], `끝 ${TOKEN_LABEL[token]}이 시작보다 작습니다.`)
      if (String(part.to).length > part.digits) {
        issue([key, 'digits'], `끝 ${TOKEN_LABEL[token]}이 자릿수보다 깁니다.`)
      }
      if (part.to > part.from && !tokens.includes(token)) {
        issue(['pattern'], `${TOKEN_LABEL[token]} 범위가 있으니 패턴에 {${token}}을 넣어 주세요.`)
      }
    }
    for (const token of tokens) {
      if (token === 'BAY' && !value.bay)
        issue(['pattern'], '연 범위를 켜야 {BAY}를 쓸 수 있습니다.')
      if (token === 'CELL' && !value.cell)
        issue(['pattern'], '칸 범위를 켜야 {CELL}을 쓸 수 있습니다.')
    }
    const count = countLocationPattern(value)
    if (count > LOCATION_BULK_MAX) {
      issue(
        ['level', 'to'],
        `한 번에 ${LOCATION_BULK_MAX.toLocaleString()}개까지 만들 수 있습니다. (지금 ${count.toLocaleString()}개)`,
      )
    }
    // 만들어질 코드 모양 확인 (첫 코드로)
    const first = expandLocationPattern({
      ...value,
      row: one(value.row),
      level: one(value.level),
      bay: value.bay && one(value.bay),
      cell: value.cell && one(value.cell),
    })[0]
    if (first && !LOCATION_CODE_PATTERN.test(first.code)) {
      issue(
        ['pattern'],
        `만들어질 코드(${first.code})가 규칙(영문 대문자·숫자·하이픈 30자)에 맞지 않습니다.`,
      )
    }
  })

export type LocationPattern = z.output<typeof locationPatternSchema>

export type GeneratedLocation = {
  code: string
  rowNo: string
  levelNo: string
  bayNo: string | null
  cellNo: string | null
}

const one = (part: RangePart): RangePart => ({ ...part, to: part.from })
const span = (part: RangePart | null) => (part ? Math.max(0, part.to - part.from + 1) : 1)
const pad = (n: number, digits: number) => String(n).padStart(digits, '0')
const values = (part: RangePart) =>
  Array.from({ length: span(part) }, (_, i) => pad(part.from + i, part.digits))

// 만들어질 개수 (목록을 다 만들지 않고 계산)
export function countLocationPattern(p: Pick<LocationPattern, 'row' | 'level' | 'bay' | 'cell'>) {
  return span(p.row) * span(p.level) * span(p.bay) * span(p.cell)
}

// 패턴 → 코드 목록 (열 → 연 → 단 → 칸 순서, 숫자는 자릿수만큼 0을 채운다)
export function expandLocationPattern(p: LocationPattern): GeneratedLocation[] {
  const result: GeneratedLocation[] = []
  const bays = p.bay ? values(p.bay) : [null]
  const cells = p.cell ? values(p.cell) : [null]
  for (const rowNo of values(p.row)) {
    for (const bayNo of bays) {
      for (const levelNo of values(p.level)) {
        for (const cellNo of cells) {
          const token: Record<PatternToken, string> = {
            ZONE: p.zoneCode,
            ROW: rowNo,
            BAY: bayNo ?? '',
            LEVEL: levelNo,
            CELL: cellNo ?? '',
          }
          const code = p.pattern
            .replace(/\{([A-Z]+)\}/g, (_, t: PatternToken) => token[t])
            .toUpperCase()
          result.push({ code, rowNo, levelNo, bayNo, cellNo })
        }
      }
    }
  }
  return result
}

// 한 칸 추가에서 코드 제안: 구역·열·단(·연)을 넣으면 패턴으로 코드를 만든다 (빈 칸은 빼고 구분자 정리)
export function suggestLocationCode(
  pattern: string,
  parts: { zone?: string; row?: string; bay?: string; level?: string; cell?: string },
) {
  const token: Record<PatternToken, string> = {
    ZONE: parts.zone ?? '',
    ROW: parts.row ?? '',
    BAY: parts.bay ?? '',
    LEVEL: parts.level ?? '',
    CELL: parts.cell ?? '',
  }
  return pattern
    .replace(/\{([A-Z]+)\}/g, (_, t: PatternToken) => token[t] ?? '')
    .toUpperCase()
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

// 창고 구분자로 기본 패턴 만들기 (구분자가 없으면 '-')
export function defaultPattern(separator: string | null | undefined) {
  const sep = separator ?? '-'
  return ['{ZONE}', '{ROW}', '{LEVEL}'].join(sep)
}
