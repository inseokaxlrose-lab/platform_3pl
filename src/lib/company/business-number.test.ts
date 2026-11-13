import { describe, expect, it } from 'vitest'
import { formatBusinessNumber, isValidBusinessNumber } from './business-number'

// 검증번호가 맞는 가상의 번호 (가중치 계산으로 만든 값, 실제 회사 번호 아님)
const VALID = '1234567891'

describe('사업자등록번호', () => {
  it('검증번호가 맞으면 통과 (하이픈·띄어쓰기 허용)', () => {
    expect(isValidBusinessNumber(VALID)).toBe(true)
    expect(isValidBusinessNumber('123-45-67891')).toBe(true)
    expect(isValidBusinessNumber(' 123 45 67891 ')).toBe(true)
  })

  it('한 자리만 틀려도, 자릿수가 다르거나 다른 글자가 섞여도 거부', () => {
    expect(isValidBusinessNumber('1234567890')).toBe(false)
    expect(isValidBusinessNumber('123456789')).toBe(false)
    expect(isValidBusinessNumber('12345678911')).toBe(false)
    expect(isValidBusinessNumber('123a4567891')).toBe(false)
    expect(isValidBusinessNumber('')).toBe(false)
  })

  it('000-00-00000 모양으로 바꾼다', () => {
    expect(formatBusinessNumber('1234567891')).toBe('123-45-67891')
    expect(formatBusinessNumber('123-4567891')).toBe('123-45-67891')
    expect(formatBusinessNumber('123')).toBe('123')
  })
})
