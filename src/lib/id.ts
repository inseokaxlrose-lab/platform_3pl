import { z } from 'zod'

// 내부 키 (docs/db-conventions.md): DB는 BIGINT 자동 증가, 서버 코드는 JS bigint
// 화면·주소·서버 액션 입출력에서는 글자('12')로 주고받고, 경계에서 바꾼다
//   서버 → 화면: String(id)
//   화면 → 서버: 입력 규칙 idSchema (글자 → bigint), 주소의 [id]: parseId

// 키 글자 모양: 1 이상의 정수 (BIGINT 범위 안: 최대 19자리)
const ID_PATTERN = /^[1-9]\d{0,18}$/
const BIGINT_MAX = 9223372036854775807n

// 글자 → 키. 모양이 틀리면 null (주소에 엉뚱한 값이 들어오면 "찾을 수 없음"으로)
export function parseId(value: string | null | undefined): bigint | null {
  if (!value || !ID_PATTERN.test(value)) return null
  const id = BigInt(value)
  return id <= BIGINT_MAX ? id : null
}

// 입력 규칙용 키: 화면이 보낸 글자('12')를 bigint로 (화면과 함께 쓰는 규칙이라 입력은 글자만)
// message: 비었거나 틀렸을 때 문구 (고르는 칸이면 '센터를 골라 주세요.'처럼)
export const idField = (message = '잘못된 키입니다.') =>
  z.string().transform((value, ctx) => {
    const id = parseId(value.trim())
    if (id === null) {
      ctx.addIssue({ code: 'custom', message })
      return z.NEVER
    }
    return id
  })

export const idSchema = idField()

// 고르지 않을 수 있는 키: 빈 글자·null은 null
export const optionalIdSchema = z
  .union([z.literal(''), z.null(), idSchema])
  .transform((value) => (value === '' || value === null ? null : value))

// 화면으로 보낼 값: 안의 모든 bigint(키)를 글자로 바꾼 모양 (날짜 등 다른 값은 그대로)
export type WithTextIds<T> = T extends bigint
  ? string
  : T extends Date
    ? T
    : T extends readonly (infer U)[]
      ? WithTextIds<U>[]
      : T extends object
        ? { [K in keyof T]: WithTextIds<T[K]> }
        : T

// 서버 → 화면 경계: 조회 결과 안의 bigint를 모두 글자로 (객체·배열 안까지)
// 예) textIds({ id: 3n, centers: [{ id: 1n }] }) → { id: '3', centers: [{ id: '1' }] }
export function textIds<T>(value: T): WithTextIds<T> {
  return convert(value) as WithTextIds<T>
}

function convert(value: unknown): unknown {
  if (typeof value === 'bigint') return String(value)
  if (Array.isArray(value)) return value.map(convert)
  // 일반 객체만 안으로 들어간다 (Date·Decimal 같은 클래스 값은 그대로)
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item)]))
  }
  return value
}
