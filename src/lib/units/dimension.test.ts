import { describe, expect, it } from 'vitest'
import { cbmOf, cmToLength, kgToWeight, lengthToCm, weightToKg } from './dimension'

// 길이·무게 표시 단위 변환 (docs/decisions/0075)

describe('길이·무게 단위 변환', () => {
  it('cm·kg는 그대로, inch·lb는 바꿔 보여 주고 되돌린다 (소수 2자리)', () => {
    expect(cmToLength('120', 'CM')).toBe('120')
    expect(cmToLength('254', 'INCH')).toBe('100')
    expect(lengthToCm('100', 'INCH')).toBe('254')
    expect(kgToWeight('1000', 'LB')).toBe('2204.62')
    expect(weightToKg('2204.62', 'LB')).toBe('1000')
    expect(cmToLength('', 'INCH')).toBe('')
    expect(cmToLength(null, 'CM')).toBe('')
  })

  it('가로·세로·높이(cm) → 부피(CBM), 하나라도 비면 빈 값', () => {
    expect(cbmOf('120', '100', '150')).toBe('1.8')
    expect(cbmOf('120', '', '150')).toBe('')
  })
})
