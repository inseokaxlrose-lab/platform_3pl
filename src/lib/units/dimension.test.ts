import { describe, expect, it } from 'vitest'
import {
  cbmOf,
  cmToLength,
  DEFAULT_DISPLAY_UNITS,
  kgToWeight,
  lengthToCm,
  weightToKg,
  type DisplayUnit,
} from './dimension'

// 길이·무게 표시 단위 변환 (docs/decisions/0075·0078) — 운영사 표시 단위는 단위 기준정보의 한 줄
const CM = DEFAULT_DISPLAY_UNITS.length
const KG = DEFAULT_DISPLAY_UNITS.weight
const INCH: DisplayUnit = { code: 'INCH', type: 'LENGTH', baseFactor: '0.0254', label: 'inch' }
const MM: DisplayUnit = { code: 'MM', type: 'LENGTH', baseFactor: '0.001', label: 'mm' }
const LB: DisplayUnit = { code: 'LB', type: 'WEIGHT', baseFactor: '0.45359237', label: 'lb' }

describe('길이·무게 단위 변환', () => {
  it('cm·kg는 그대로, inch·mm·lb는 바꿔 보여 주고 되돌린다 (소수 2자리)', () => {
    expect(cmToLength('120', CM)).toBe('120')
    expect(cmToLength('254', INCH)).toBe('100')
    expect(lengthToCm('100', INCH)).toBe('254')
    expect(cmToLength('12.5', MM)).toBe('125')
    expect(kgToWeight('1000', KG)).toBe('1000')
    expect(kgToWeight('1000', LB)).toBe('2204.62')
    expect(weightToKg('2204.62', LB)).toBe('1000')
    expect(weightToKg('1,000', LB)).toBe('453.59')
    expect(cmToLength('', INCH)).toBe('')
    expect(cmToLength(null, CM)).toBe('')
  })

  it('가로·세로·높이(cm) → 부피(CBM), 하나라도 비거나 숫자가 아니면 빈 값', () => {
    expect(cbmOf('120', '100', '150')).toBe('1.8')
    expect(cbmOf('33.3', '33.3', '33.3')).toBe('0.0369')
    expect(cbmOf('120', '', '150')).toBe('')
    expect(cbmOf('120', 'x', '150')).toBe('')
  })
})
