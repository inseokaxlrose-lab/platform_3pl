import { describe, expect, it } from 'vitest'
import { unitCreateSchema } from '../src/lib/units/unit-schema'
import { SEED_UNITS } from './seed-units'

describe('시드 기본 단위', () => {
  it('입력 규칙에 맞고, 코드가 겹치지 않고, 시스템 단위(EA·BOX·PLT)가 있다', () => {
    for (const unit of SEED_UNITS) {
      const parsed = unitCreateSchema.safeParse({
        ...unit,
        sortOrder: 0,
        isActive: true,
        externalCodes: {},
      })
      expect(parsed.success, unit.code).toBe(true)
    }
    expect(new Set(SEED_UNITS.map((u) => u.code)).size).toBe(SEED_UNITS.length)
    expect(SEED_UNITS.filter((u) => u.isSystem).map((u) => u.code)).toEqual(['EA', 'BOX', 'PLT'])
  })
})
