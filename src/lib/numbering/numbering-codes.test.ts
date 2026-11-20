import { describe, expect, it } from 'vitest'
import {
  autoPatternOf,
  codeHead,
  formatCode,
  periodKeyOf,
  type NumberingRuleSpec,
} from './numbering-codes'

// 체번 번호 모양 (0084) — 순수 함수

const rule = (overrides: Partial<NumberingRuleSpec>): NumberingRuleSpec => ({
  target: 'ASN',
  scope: 'OPERATOR',
  prefixSource: 'FIXED',
  fixedPrefix: 'AS',
  typeChar: null,
  separator: '-',
  dateFormat: 'YYMMDD',
  seqLength: 4,
  resetCycle: 'DAY',
  ...overrides,
})

// 2026-11-19 15:30 UTC = 한국 11-20 00:30, 뉴욕 11-19 10:30
const AT = new Date('2026-11-19T15:30:00Z')

describe('체번 번호 모양', () => {
  it('주기 키는 운영사 타임존의 날짜 (한국은 자정이 지나면 다음 날)', () => {
    expect(periodKeyOf('DAY', AT, 'Asia/Seoul')).toBe('261120')
    expect(periodKeyOf('DAY', AT, 'America/New_York')).toBe('261119')
    expect(periodKeyOf('MONTH', AT, 'Asia/Seoul')).toBe('2611')
    expect(periodKeyOf('YEAR', AT, 'Asia/Seoul')).toBe('26')
    expect(periodKeyOf('NONE', AT, 'Asia/Seoul')).toBe('-')
  })

  it('전표: AS261120-0001, 라벨 6자리, 자리수를 넘으면 잘라 내지 않고 길어진다', () => {
    const head = codeHead(rule({}), 'AS', AT, 'Asia/Seoul')
    expect(formatCode(head, 1, 4)).toBe('AS261120-0001')
    expect(
      formatCode(codeHead(rule({ fixedPrefix: 'LB', seqLength: 6 }), 'LB', AT, 'Asia/Seoul'), 7, 6),
    ).toBe('LB261120-000007')
    expect(formatCode(head, 12345, 4)).toBe('AS261120-12345')
  })

  it('마스터: 화주사 SH0001, 품목 {접두어}S000123, 납품처 {거래처코드}-01', () => {
    const shipper = rule({
      fixedPrefix: 'SH',
      separator: null,
      dateFormat: 'NONE',
      resetCycle: 'NONE',
    })
    expect(formatCode(codeHead(shipper, 'SH', AT, 'Asia/Seoul'), 1, 4)).toBe('SH0001')
    const item = rule({
      prefixSource: 'SHIPPER_PREFIX',
      fixedPrefix: null,
      typeChar: 'S',
      separator: null,
      dateFormat: 'NONE',
      seqLength: 6,
    })
    expect(formatCode(codeHead(item, 'AB', AT, 'Asia/Seoul'), 123, 6)).toBe('ABS000123')
    const shipTo = rule({
      prefixSource: 'PARENT_CD',
      fixedPrefix: null,
      dateFormat: 'NONE',
      seqLength: 2,
    })
    expect(formatCode(codeHead(shipTo, 'ABC000123', AT, 'Asia/Seoul'), 1, 2)).toBe('ABC000123-01')
  })

  it('자동 체번 모양: 같은 모양의 직접 입력을 알아본다', () => {
    const item = rule({
      prefixSource: 'SHIPPER_PREFIX',
      fixedPrefix: null,
      typeChar: 'S',
      separator: null,
      dateFormat: 'NONE',
      seqLength: 6,
    })
    const pattern = autoPatternOf(item, 'AB')
    expect(pattern.test('ABS000123')).toBe(true)
    expect(pattern.test('ABS0001234')).toBe(true)
    expect(pattern.test('ABS00012')).toBe(false)
    expect(pattern.test('ABC000123')).toBe(false)
    expect(pattern.test('SKU-001')).toBe(false)
    expect(autoPatternOf(rule({}), 'AS').test('AS261120-0001')).toBe(true)
    expect(autoPatternOf(rule({}), 'AS').test('AS2611200001')).toBe(false)
  })
})
