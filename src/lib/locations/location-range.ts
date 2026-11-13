import { z } from 'zod'

// 로케이션 일괄 생성 규칙 (docs/decisions/0028) — 화면 미리보기·서버 공용 순수 함수
// 구역(영문 한 글자 범위) × 열(숫자 범위) × 단(숫자 범위) → 'A-01-02' 같은 코드 목록

// 한 번에 만들 수 있는 최대 개수 (실수로 수만 개가 생기는 것을 막는다)
export const MAX_BULK_LOCATIONS = 2000

// 로케이션 코드 규칙: 영문 대문자·숫자·하이픈 1~30자 (소문자는 대문자로)
export const LOCATION_CODE_PATTERN = /^[A-Z0-9-]{1,30}$/

export const locationCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (value) => LOCATION_CODE_PATTERN.test(value),
    '로케이션 코드는 영문·숫자·하이픈 1~30자입니다.',
  )

const letter = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]$/, '영문 한 글자입니다.')
const number = z
  .number()
  .int('정수로 입력해 주세요.')
  .min(0, '0 이상입니다.')
  .max(999, '999 이하입니다.')
const digits = z.number().int().min(1).max(3)

export const locationRangeSchema = z
  .object({
    zoneFrom: letter,
    zoneTo: letter,
    aisleFrom: number,
    aisleTo: number,
    aisleDigits: digits,
    levelFrom: number,
    levelTo: number,
    levelDigits: digits,
    // 구분자: 하이픈 또는 없음 (A-01-02 / A0102)
    separator: z.enum(['-', '']),
  })
  .superRefine((range, ctx) => {
    if (range.zoneFrom > range.zoneTo) {
      ctx.addIssue({ code: 'custom', path: ['zoneTo'], message: '끝 구역이 시작보다 앞입니다.' })
    }
    if (range.aisleFrom > range.aisleTo) {
      ctx.addIssue({ code: 'custom', path: ['aisleTo'], message: '끝 열이 시작보다 작습니다.' })
    }
    if (range.levelFrom > range.levelTo) {
      ctx.addIssue({ code: 'custom', path: ['levelTo'], message: '끝 단이 시작보다 작습니다.' })
    }
    // 자릿수보다 큰 숫자는 모양이 깨진다 (예: 자릿수 2인데 100열)
    if (String(range.aisleTo).length > range.aisleDigits) {
      ctx.addIssue({ code: 'custom', path: ['aisleDigits'], message: '끝 열이 자릿수보다 깁니다.' })
    }
    if (String(range.levelTo).length > range.levelDigits) {
      ctx.addIssue({ code: 'custom', path: ['levelDigits'], message: '끝 단이 자릿수보다 깁니다.' })
    }
    const count = countLocationRange(range)
    if (count > MAX_BULK_LOCATIONS) {
      ctx.addIssue({
        code: 'custom',
        path: ['levelTo'],
        message: `한 번에 ${MAX_BULK_LOCATIONS.toLocaleString()}개까지 만들 수 있습니다. (지금 ${count.toLocaleString()}개)`,
      })
    }
  })

export type LocationRange = z.output<typeof locationRangeSchema>

export type GeneratedLocation = { code: string; zone: string; aisle: string; level: string }

const span = (from: number, to: number) => Math.max(0, to - from + 1)

// 만들어질 개수 (목록을 다 만들지 않고 계산)
export function countLocationRange(
  range: Pick<
    LocationRange,
    'zoneFrom' | 'zoneTo' | 'aisleFrom' | 'aisleTo' | 'levelFrom' | 'levelTo'
  >,
) {
  const zones = span(range.zoneFrom.charCodeAt(0), range.zoneTo.charCodeAt(0))
  return zones * span(range.aisleFrom, range.aisleTo) * span(range.levelFrom, range.levelTo)
}

// 범위 → 코드 목록 (구역 → 열 → 단 순서, 숫자는 자릿수만큼 0을 채운다)
export function expandLocationRange(range: LocationRange): GeneratedLocation[] {
  const result: GeneratedLocation[] = []
  for (let z = range.zoneFrom.charCodeAt(0); z <= range.zoneTo.charCodeAt(0); z++) {
    const zone = String.fromCharCode(z)
    for (let a = range.aisleFrom; a <= range.aisleTo; a++) {
      const aisle = String(a).padStart(range.aisleDigits, '0')
      for (let l = range.levelFrom; l <= range.levelTo; l++) {
        const level = String(l).padStart(range.levelDigits, '0')
        result.push({ code: [zone, aisle, level].join(range.separator), zone, aisle, level })
      }
    }
  }
  return result
}
