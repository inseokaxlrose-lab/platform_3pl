import { describe, expect, it } from 'vitest'
import { unitCreateSchema } from '@/lib/units/unit-schema'
import { DEFAULT_UNITS } from './units'

describe('시드 기본 단위', () => {
  it('입력 규칙에 맞고, 코드가 겹치지 않고, 시스템 단위(EA·BOX·PLT)가 있다', () => {
    for (const unit of DEFAULT_UNITS) {
      const parsed = unitCreateSchema.safeParse({
        ...unit,
        sortOrder: 0,
        isActive: true,
        externalCodes: {},
      })
      expect(parsed.success, unit.code).toBe(true)
    }
    expect(new Set(DEFAULT_UNITS.map((u) => u.code)).size).toBe(DEFAULT_UNITS.length)
    expect(DEFAULT_UNITS.filter((u) => u.isSystem).map((u) => u.code)).toEqual(['EA', 'BOX', 'PLT'])
  })
})
