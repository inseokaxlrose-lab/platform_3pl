import { describe, expect, it } from 'vitest'
import {
  breakdownQty,
  checkQtyDecimals,
  formatQty,
  labelQuantities,
  parseQty,
  qtyText,
  splitBaseQty,
  toBaseQty,
} from './convert'

// 단위 환산 공통 함수 (0042, 0003 결정 3·6)
// 예: 생수 / 기본단위 EA / BOX = 24 EA / PLT = 1,440 EA

describe('parseQty · qtyText (글자 ↔ 고정 소수점)', () => {
  it('정확하게 오간다 (끝의 0 제거, 음수, 0)', () => {
    expect(parseQty('2.5')).toBe(2_500_000n)
    expect(qtyText(parseQty('24.000'))).toBe('24')
    expect(qtyText(parseQty('-0.125'))).toBe('-0.125')
    expect(qtyText(parseQty('0.000'))).toBe('0')
    expect(qtyText(parseQty('-0'))).toBe('0')
    expect(qtyText(parseQty('123456789012.000001'))).toBe('123456789012.000001')
  })

  it('숫자 모양이 아니거나 소수 6자리를 넘으면 거부', () => {
    for (const bad of ['', 'abc', '1,000', '1.2.3', '.5', '1e3']) {
      expect(() => parseQty(bad)).toThrow('수량 형식')
    }
    expect(() => parseQty('0.0000001')).toThrow('소수 6자리')
    // 끝의 0은 자리로 세지 않는다
    expect(parseQty('1.5000000000')).toBe(1_500_000n)
  })

  it('소수 오차가 없다 (0.1 + 0.2 같은 일이 생기지 않는다)', () => {
    expect(qtyText(parseQty('0.1') + parseQty('0.2'))).toBe('0.3')
  })
})

describe('toBaseQty (환산단위 → 기본단위)', () => {
  it('정수·소수 단위', () => {
    expect(toBaseQty('3', '24')).toBe('72')
    expect(toBaseQty('2', '1440')).toBe('2880')
    // KG 기본단위: BOX = 2.5 KG → 3 BOX = 7.5 KG
    expect(toBaseQty('3', '2.5')).toBe('7.5')
    expect(toBaseQty('1.5', '0.125')).toBe('0.1875')
    expect(toBaseQty('0', '24')).toBe('0')
  })

  it('입수량은 0보다 커야 하고, 6자리를 넘는 결과는 거부', () => {
    expect(() => toBaseQty('1', '0')).toThrow('0보다')
    expect(() => toBaseQty('1', '-1')).toThrow('0보다')
    expect(() => toBaseQty('0.001', '0.0001')).toThrow('6자리')
  })
})

describe('splitBaseQty (기본단위 → 묶음 + 나머지)', () => {
  it('나누어떨어짐과 나머지', () => {
    expect(splitBaseQty('3000', '1440')).toEqual({ packs: '2', remainder: '120' })
    expect(splitBaseQty('2880', '1440')).toEqual({ packs: '2', remainder: '0' })
    expect(splitBaseQty('10', '24')).toEqual({ packs: '0', remainder: '10' })
    expect(splitBaseQty('7.75', '2.5')).toEqual({ packs: '3', remainder: '0.25' })
  })

  it('음수는 나누지 않는다', () => {
    expect(() => splitBaseQty('-1', '24')).toThrow('0 이상')
  })
})

describe('breakdownQty (큰 단위부터 나눠 보여 주기)', () => {
  const units = [
    { unit: 'BOX', convQty: '24' },
    { unit: 'PLT', convQty: '1440' },
  ]

  it('큰 단위부터, 0인 단위는 빼고 남는 기본단위', () => {
    expect(breakdownQty('3000', units, 'EA')).toEqual([
      { unit: 'PLT', qty: '2' },
      { unit: 'BOX', qty: '5' },
    ])
    expect(breakdownQty('3001', units, 'EA')).toEqual([
      { unit: 'PLT', qty: '2' },
      { unit: 'BOX', qty: '5' },
      { unit: 'EA', qty: '1' },
    ])
    expect(breakdownQty('30', units, 'EA')).toEqual([
      { unit: 'BOX', qty: '1' },
      { unit: 'EA', qty: '6' },
    ])
  })

  it('0이면 기본단위 0, 환산단위가 없으면 기본단위 그대로', () => {
    expect(breakdownQty('0', units, 'EA')).toEqual([{ unit: 'EA', qty: '0' }])
    expect(breakdownQty('7.5', [], 'KG')).toEqual([{ unit: 'KG', qty: '7.5' }])
  })
})

describe('labelQuantities (라벨 장수·장마다 수량, 0003 결정 6)', () => {
  it('결정 기록의 예: 검수 3,000 EA, PLT = 1,440 EA → 3장 (1,440 / 1,440 / 120)', () => {
    expect(labelQuantities('3000', '1440')).toEqual(['1440', '1440', '120'])
  })

  it('나누어떨어지면 나머지 장 없음, 입수량보다 적으면 1장, 0이면 없음', () => {
    expect(labelQuantities('2880', '1440')).toEqual(['1440', '1440'])
    expect(labelQuantities('10', '24')).toEqual(['10'])
    expect(labelQuantities('0', '24')).toEqual([])
    expect(labelQuantities('7.5', '2.5')).toEqual(['2.5', '2.5', '2.5'])
  })

  it('너무 많은 장수는 거부 (실수 방지)', () => {
    expect(() => labelQuantities('1000000', '1')).toThrow('너무 많습니다')
    expect(labelQuantities('5', '1', 5)).toHaveLength(5)
  })
})

describe('checkQtyDecimals · formatQty', () => {
  it('소수 자리 검사 (끝의 0은 세지 않는다)', () => {
    expect(checkQtyDecimals('2', 0)).toBe(true)
    expect(checkQtyDecimals('2.0', 0)).toBe(true)
    expect(checkQtyDecimals('2.5', 0)).toBe(false)
    expect(checkQtyDecimals('2.125', 3)).toBe(true)
    expect(checkQtyDecimals('2.1255', 3)).toBe(false)
  })

  it('화면 표시: 천 단위 쉼표, 끝의 0 제거, DB Decimal도 받는다', () => {
    expect(formatQty('1440.000')).toBe('1,440')
    expect(formatQty('1234567.5')).toBe('1,234,567.5')
    expect(formatQty('-1000')).toBe('-1,000')
    expect(formatQty({ toString: () => '24.000' })).toBe('24')
  })
})
