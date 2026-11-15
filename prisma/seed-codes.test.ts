import { describe, expect, it } from 'vitest'
import { groupCodeField, itemCodeField } from '../src/lib/common-code/code-schema'
import { SEED_CODE_GROUPS } from './seed-codes'

describe('시드 공통코드 정의', () => {
  it('그룹 코드·코드가 입력 규칙에 맞고, 그룹 안에서 코드가 겹치지 않는다', () => {
    for (const group of SEED_CODE_GROUPS) {
      expect(groupCodeField.safeParse(group.code).success, group.code).toBe(true)
      const codes = group.items.map((item) => item.code)
      expect(new Set(codes).size, group.code).toBe(codes.length)
      for (const code of codes) expect(itemCodeField.parse(code), code).toBe(code)
    }
  })
})
