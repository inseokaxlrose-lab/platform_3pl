import { describe, expect, it } from 'vitest'
import { unitChoices, type UnitSelectOption } from './unit-select'

// 단위 고르기 선택지 (0078)
const unit = (code: string, type: UnitSelectOption['type'], isActive = true): UnitSelectOption => ({
  id: code,
  code,
  name: code,
  type,
  decimals: 0,
  isActive,
})
const OPTIONS = [
  unit('EA', 'QTY'),
  unit('BOX', 'PACK'),
  unit('KG', 'WEIGHT'),
  unit('LB', 'WEIGHT', false),
]
const codes = (list: UnitSelectOption[]) => list.map((u) => u.code)

describe('unitChoices', () => {
  it('허용 유형만, 사용 중지 단위는 빼고 순서는 그대로', () => {
    expect(codes(unitChoices(OPTIONS, {}))).toEqual(['EA', 'BOX', 'KG'])
    expect(codes(unitChoices(OPTIONS, { types: ['WEIGHT'] }))).toEqual(['KG'])
  })

  it('사용 중지 단위는 지금 값이거나 조회 화면(includeInactive)일 때만', () => {
    expect(codes(unitChoices(OPTIONS, { types: ['WEIGHT'], value: 'LB' }))).toEqual(['KG', 'LB'])
    expect(codes(unitChoices(OPTIONS, { types: ['WEIGHT'], includeInactive: true }))).toEqual([
      'KG',
      'LB',
    ])
  })
})
