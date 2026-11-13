import { describe, expect, it } from 'vitest'
import { formatDate, formatNumber } from './format'

describe('formatNumber', () => {
  it('천 단위 쉼표를 넣는다', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(999)).toBe('999')
  })

  it('Decimal 문자열을 숫자로 바꾸지 않고 그대로 서식한다 (오차 없음)', () => {
    expect(formatNumber('12345678901234567890.123456')).toBe('12,345,678,901,234,567,890.123456')
    expect(formatNumber('0.1')).toBe('0.1')
  })

  it('소수 끝의 0은 지우고, 반올림은 하지 않는다', () => {
    expect(formatNumber('12.500')).toBe('12.5')
    expect(formatNumber('12.000')).toBe('12')
    expect(formatNumber('1.23456789')).toBe('1.23456789')
  })

  it('음수와 0을 처리한다', () => {
    expect(formatNumber('-1234.50')).toBe('-1,234.5')
    expect(formatNumber('-0.000')).toBe('0')
    expect(formatNumber(0)).toBe('0')
  })

  it('값이 없으면 null', () => {
    expect(formatNumber(null)).toBeNull()
    expect(formatNumber(undefined)).toBeNull()
    expect(formatNumber('')).toBeNull()
    expect(formatNumber(Number.NaN)).toBeNull()
  })

  it('toString()이 있는 객체(Prisma Decimal 등)도 처리한다', () => {
    expect(formatNumber({ toString: () => '1000.250' })).toBe('1,000.25')
  })

  it('숫자가 아닌 문자열은 그대로 돌려준다', () => {
    expect(formatNumber('N/A')).toBe('N/A')
  })
})

describe('formatDate', () => {
  it('한국 시간 기준으로 날짜를 만든다 (UTC 15시 = 한국 다음 날 0시)', () => {
    expect(formatDate(new Date('2026-11-12T15:00:00Z'))).toBe('2026-11-13')
    expect(formatDate('2026-11-12T14:59:00Z')).toBe('2026-11-12')
  })

  it('withTime이면 시:분까지 표시한다', () => {
    expect(formatDate('2026-11-13T05:05:00Z', true)).toBe('2026-11-13 14:05')
  })

  it('시간 없는 날짜 문자열은 시간대 변환 없이 그대로 쓴다', () => {
    expect(formatDate('2026-12-31')).toBe('2026-12-31')
  })

  it('값이 없으면 null, 날짜가 아니면 원래 값', () => {
    expect(formatDate(null)).toBeNull()
    expect(formatDate('')).toBeNull()
    expect(formatDate('알 수 없음')).toBe('알 수 없음')
  })
})
