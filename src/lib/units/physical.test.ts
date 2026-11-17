import { describe, expect, it } from 'vitest'
import { convertPhysical, roundQty, validateQty, type PhysicalUnit } from './physical'

// 물리 단위 환산·수량 자리수 (0078) — 시드의 환산계수 그대로

const u = (code: string, type: string, baseFactor: string | null): PhysicalUnit => ({
  code,
  type,
  baseFactor,
})
const KG = u('KG', 'WEIGHT', '1')
const G = u('G', 'WEIGHT', '0.001')
const LB = u('LB', 'WEIGHT', '0.45359237')
const TON = u('TON', 'WEIGHT', '1000')
const M = u('M', 'LENGTH', '1')
const CM = u('CM', 'LENGTH', '0.01')
const INCH = u('INCH', 'LENGTH', '0.0254')
const EA = u('EA', 'QTY', '1')
const BOX = u('BOX', 'PACK', null)

const ok = (qty: string) => ({ ok: true, qty })

describe('convertPhysical', () => {
  it('G ↔ KG, TON → KG (부동소수점 오차 없음)', () => {
    expect(convertPhysical('500', G, KG)).toEqual(ok('0.5'))
    expect(convertPhysical('1.5', KG, G)).toEqual(ok('1500'))
    expect(convertPhysical('0.1', KG, G)).toEqual(ok('100'))
    expect(convertPhysical('2.5', TON, KG)).toEqual(ok('2500'))
    expect(convertPhysical('-250', G, KG)).toEqual(ok('-0.25'))
  })

  it('LB ↔ KG: 계수 8자리, 결과 자리수 지정 시 반올림', () => {
    expect(convertPhysical('1', LB, KG)).toEqual(ok('0.45359237'))
    expect(convertPhysical('10', LB, KG, 2)).toEqual(ok('4.54'))
    expect(convertPhysical('1', KG, LB, 4)).toEqual(ok('2.2046'))
    // 왕복해도 원래 값 (반올림 자리 안에서)
    const lb = convertPhysical('100', KG, LB) as { qty: string }
    expect(convertPhysical(lb.qty, LB, KG, 6)).toEqual(ok('100'))
  })

  it('CM ↔ INCH, M ↔ CM', () => {
    expect(convertPhysical('2.54', CM, INCH)).toEqual(ok('1'))
    expect(convertPhysical('10', INCH, CM)).toEqual(ok('25.4'))
    expect(convertPhysical('120', CM, M)).toEqual(ok('1.2'))
    expect(convertPhysical('100', CM, INCH, 2)).toEqual(ok('39.37'))
  })

  it('수량·포장 단위, 다른 유형, 잘못된 수는 오류 (품목 환산 안내)', () => {
    expect(convertPhysical('3', BOX, EA)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/품목 환산/),
    })
    expect(convertPhysical('3', EA, KG)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/품목 환산/),
    })
    expect(convertPhysical('3', KG, CM)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/유형이 달라/),
    })
    expect(convertPhysical('3', u('근', 'WEIGHT', null), KG)).toMatchObject({ ok: false })
    expect(convertPhysical('abc', G, KG)).toMatchObject({ ok: false })
  })
})

describe('roundQty · validateQty', () => {
  it('단위 소수 자리수로 반올림', () => {
    expect(roundQty('1.23456', { decimals: 3 })).toBe('1.235')
    expect(roundQty('2.5', { decimals: 0 })).toBe('3')
    expect(roundQty('1,200.10', { decimals: 1 })).toBe('1200.1')
  })

  it('자리수를 넘으면 오류 문구, 끝의 0은 세지 않는다', () => {
    expect(validateQty('3', { code: 'EA', decimals: 0 })).toBeNull()
    expect(validateQty('3.0', { code: 'EA', decimals: 0 })).toBeNull()
    expect(validateQty('2.5', { code: 'EA', decimals: 0 })).toMatch(/정수로만/)
    expect(validateQty('1.2345', { code: 'KG', decimals: 3 })).toMatch(/소수 3자리/)
    expect(validateQty('x', { code: 'KG', decimals: 3 })).toMatch(/숫자가 아닙니다/)
  })
})
