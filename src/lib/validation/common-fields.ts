import { z } from 'zod'

// 입력 칸 공통 규칙 — 화면·서버 공용 (운영사·센터·화주사·거래처 등 기준정보 입력에서 재사용)

const digitsOnly = (value: string) => value.replace(/\D/g, '')

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

// 전화·팩스: 숫자·하이픈, 숫자 8~12자리 (예: 02-123-4567, 010-1234-5678, 1588-1234)
export const optionalPhone = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || (/^[\d-]+$/.test(value) && /^\d{8,12}$/.test(digitsOnly(value))),
    '숫자와 하이픈(-)으로 8~12자리를 입력해 주세요.',
  )
  .transform((value) => value || null)

export const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === '' || z.email().safeParse(value).success, '이메일 형식이 아닙니다.')
  .transform((value) => value.toLowerCase() || null)

// 주소 3칸 (카카오 주소 검색 공통 부품 AddressFields와 같은 모양)
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
