import { describe, expect, it } from 'vitest'
import { formatPhone, isValidPhone } from './phone'

describe('전화번호 표시', () => {
  it.each([
    ['021234567', '02-123-4567'],
    ['0212345678', '02-1234-5678'],
    ['0311234567', '031-123-4567'],
    ['01012345678', '010-1234-5678'],
    ['07012345678', '070-1234-5678'],
    ['15881234', '1588-1234'],
    ['050512345678', '0505-1234-5678'],
    ['02-123-4567', '02-123-4567'],
  ])('%s → %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected)
  })

  it('입력 중인 짧은 값은 자리까지만 끊는다', () => {
    expect(formatPhone('0')).toBe('0')
    expect(formatPhone('010')).toBe('010')
    expect(formatPhone('0101')).toBe('010-1')
    expect(formatPhone('0101234')).toBe('010-123-4')
    expect(formatPhone('1588')).toBe('1588')
    expect(formatPhone('15881')).toBe('1588-1')
    expect(formatPhone('')).toBe('')
  })
})

describe('전화번호 검사', () => {
  it('앞자리별 자릿수가 맞으면 통과', () => {
    for (const ok of [
      '02-123-4567',
      '0212345678',
      '031-123-4567',
      '010 1234 5678',
      '15881234',
      '050512345678',
    ]) {
      expect(isValidPhone(ok), ok).toBe(true)
    }
  })

  it('자릿수가 맞지 않거나 다른 글자가 섞이면 거부', () => {
    for (const bad of [
      '0212345',
      '010123456789',
      '1234-5678',
      '12345678',
      '010-1234-567a',
      '(02)123-4567',
    ]) {
      expect(isValidPhone(bad), bad).toBe(false)
    }
  })
})
