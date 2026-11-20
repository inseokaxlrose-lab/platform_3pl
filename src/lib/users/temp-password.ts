import 'server-only'
import { randomInt } from 'node:crypto'

// 임시 비밀번호 만들기 (0086): 영문 대·소문자 + 숫자 12자, 영문·숫자가 반드시 하나 이상
// 전화·메모로 전할 때 헷갈리는 글자(0·O·o, 1·l·I)는 뺀다. 암호학적 난수(crypto.randomInt)를 쓴다
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'
const ALL = UPPER + LOWER + DIGITS

const pick = (chars: string) => chars[randomInt(chars.length)]

export function generateTempPassword(length = 12): string {
  // 종류마다 한 글자씩 넣고 나머지는 전체에서 고른 뒤 섞는다
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)]
  while (chars.length < length) chars.push(pick(ALL))
  // 피셔-예이츠 섞기
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
