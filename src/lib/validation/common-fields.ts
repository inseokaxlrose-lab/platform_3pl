import { z } from 'zod'
import { digitsOnly, isValidBusinessNumber, isValidPhone } from '@/lib/format'

// 입력 칸 공통 규칙 — 화면·서버 공용 (운영사·센터·화주사·거래처 등 기준정보 입력에서 재사용)

// 선택 입력 글자: 앞뒤 공백 제거, 비어 있으면 null
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이하로 입력해 주세요.`)
    .transform((value) => value || null)

// 필수 입력 글자 (message: 비었을 때 문구, 예 '센터명을 입력해 주세요.')
export const requiredText = (message: string, max: number) =>
  z.string().trim().min(1, message).max(max, `${max}자 이하로 입력해 주세요.`)

// 전화·팩스: 하이픈·띄어쓰기는 받아 주고, 저장은 숫자만 (docs/decisions/0029)
// 예: 02-123-4567 → '021234567', 010-1234-5678, 1588-1234
export const optionalPhone = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || isValidPhone(value),
    '전화번호를 확인해 주세요. (예: 02-123-4567, 010-1234-5678, 1588-1234)',
  )
  .transform((value) => digitsOnly(value) || null)

// 사업자등록번호 (선택): 비우면 null, 넣으면 검증번호까지 확인하고 숫자만 저장 (0029)
export const optionalBusinessNumber = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || isValidBusinessNumber(value),
    '사업자등록번호를 확인해 주세요. (10자리, 검증번호 불일치)',
  )
  .transform((value) => digitsOnly(value) || null)

export const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === '' || z.email().safeParse(value).success, '이메일 형식이 아닙니다.')
  .transform((value) => value.toLowerCase() || null)

// 주소 3칸 (카카오 주소 검색 공통 부품 AddressInput와 같은 모양)
export const addressShape = {
  zipCode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{5}$/.test(value), '우편번호는 숫자 5자리입니다.')
    .transform((value) => value || null),
  address: optionalText(200),
  addressDetail: optionalText(200),
}

// 사용자 코드 (docs/decisions/0025): 비우면 시스템 코드를 쓴다. 소문자는 대문자로
// 영문·숫자·하이픈·밑줄 2~20자 (시스템 코드 모양 금지는 저장할 때 서버에서 검사)
export const userCodeField = (label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .max(20, '20자 이하로 입력해 주세요.')
    .refine(
      (value) => value === '' || (value.length >= 2 && /^[A-Z0-9_-]+$/.test(value)),
      `${label}는 영문·숫자·하이픈·밑줄 2~20자입니다.`,
    )

// ── 여러 칸을 함께 보는 규칙 (화면·서버 공용) ──

// "둘(이상) 중 하나는 필수": 객체 규칙에 .superRefine(requireOneOf([...], '문구'))로 붙인다
// 오류는 첫 번째 칸에 붙는다 (화면에서 그 칸으로 이동·표시)
export function requireOneOf<T extends Record<string, unknown>>(
  keys: readonly (keyof T & string)[],
  message: string,
) {
  return (value: T, ctx: z.RefinementCtx) => {
    const filled = keys.some((key) => {
      const v = value[key]
      return v !== null && v !== undefined && String(v).trim() !== ''
    })
    if (!filled) ctx.addIssue({ code: 'custom', message, path: [keys[0]] })
  }
}

// 목록 안에서 하나만 골라야 하는 칸 (예: 대표 담당자): 행이 있으면 정확히 1개
// 배열 규칙에 .superRefine(exactlyOne('isPrimary', '문구'))로 붙인다. 오류는 목록 전체에 붙는다
export function exactlyOne<T extends Record<string, unknown>>(
  key: keyof T & string,
  message: string,
) {
  return (rows: readonly T[], ctx: z.RefinementCtx) => {
    if (rows.length === 0) return
    if (rows.filter((row) => row[key] === true).length !== 1) {
      ctx.addIssue({ code: 'custom', message })
    }
  }
}

// 날짜 (선택): 'YYYY-MM-DD', 비우면 null
export const optionalDateText = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))),
    '날짜를 확인해 주세요.',
  )
  .transform((value) => value || null)

// 시각 (선택): 'HH:MM' 24시간, 비우면 null (DB는 TIME — src/lib/format/time.ts로 바꾼다)
export const optionalTime = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    '시각은 00:00~23:59입니다.',
  )
  .transform((value) => value || null)

// 소수 (선택, 0 이상): 글자로 받아 글자로 넘긴다 (DB Decimal, Number로 계산하지 않는다)
export const optionalDecimal = (digits: number, scale: number) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        new RegExp(`^\\d{1,${digits - scale}}(\\.\\d{1,${scale}})?$`).test(value.replace(/,/g, '')),
      `0 이상, 소수 ${scale}자리까지의 숫자입니다.`,
    )
    .transform((value) => value.replace(/,/g, '') || null)

// 정수 (선택, 0 이상)
export const optionalCount = z
  .number()
  .int('정수로 입력해 주세요.')
  .min(0, '0 이상입니다.')
  .max(999_999, '너무 큽니다.')
  .nullable()
