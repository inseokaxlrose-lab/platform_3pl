import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ApiEnv } from './api-codes'

// API 키 만들기·해시·형식 검사 (docs/decisions/0081)
// 형식: {환경}_{식별부}_{비밀부}  예) live_ak7f2c9x_9Xq…
// - 식별부(8자, 소문자·숫자): DB에서 키를 찾는 데 쓰고 화면에도 보인다
// - 비밀부(40자, 영문 대소문자·숫자): 발급할 때 한 번만 보이고 저장하지 않는다
// - DB에는 키 전체의 HMAC-SHA256(API_KEY_SECRET) 해시만 저장한다

const PREFIX_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789' // 헷갈리는 글자(l·o·0·1) 뺌
const SECRET_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const PREFIX_LENGTH = 8
const SECRET_LENGTH = 40
const KEY_PATTERN = /^(test|live)_([a-z0-9]{8})_([A-Za-z0-9]{40})$/

// 무작위 글자 (치우침 없이: 글자 수의 배수 안에서만 고른다)
function randomText(chars: string, length: number) {
  const limit = 256 - (256 % chars.length)
  let text = ''
  while (text.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && text.length < length) text += chars[byte % chars.length]
    }
  }
  return text
}

function secret() {
  const value = process.env.API_KEY_SECRET
  if (!value || value.length < 32) {
    throw new Error('API_KEY_SECRET이 없거나 너무 짧습니다 (.env, 32자 이상).')
  }
  return value
}

// 키 전체 → 해시 (64자 16진수)
export function hashApiKey(fullKey: string) {
  return createHmac('sha256', secret()).update(fullKey).digest('hex')
}

// 새 키 (원문은 이 결과에서만 볼 수 있다 — 발급 화면에 한 번 보이고 버린다)
export function generateApiKey(env: ApiEnv) {
  const prefix = randomText(PREFIX_CHARS, PREFIX_LENGTH)
  const fullKey = `${env.toLowerCase()}_${prefix}_${randomText(SECRET_CHARS, SECRET_LENGTH)}`
  return { fullKey, prefix, hash: hashApiKey(fullKey) }
}

// 요청 헤더의 키 → 환경·식별부 (형식이 틀리면 null)
export function parseApiKey(raw: string | null): { env: ApiEnv; prefix: string } | null {
  const match = raw?.trim().match(KEY_PATTERN)
  if (!match) return null
  return { env: match[1].toUpperCase() as ApiEnv, prefix: match[2] }
}

// 해시 비교 (걸리는 시간으로 맞는 글자 수를 알 수 없게)
export function isSameHash(fullKey: string, storedHash: string) {
  const actual = Buffer.from(hashApiKey(fullKey), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// 화면 표시용: live_ak7f2c9x_••••
export const maskedKey = (env: string, prefix: string) => `${env.toLowerCase()}_${prefix}_••••`
