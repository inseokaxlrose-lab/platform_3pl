import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { STORAGE_CONDITIONS } from './warehouse-labels'
import { createWarehouseSchema, type WarehouseCreateInput } from './warehouse-schema'

const input = (overrides: Partial<WarehouseCreateInput> = {}): WarehouseCreateInput => ({
  centerId: 'c1',
  code: '',
  name: '상온 1창고',
  storageCondition: 'AMBIENT',
  externalCodes: { SAP: '', ERP: '' },
  ...overrides,
})

const errorsOf = (value: WarehouseCreateInput) => {
  const parsed = createWarehouseSchema.safeParse(value)
  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors
}

describe('창고 입력 규칙', () => {
  it('코드는 대문자로, 비어 있으면 그대로 빈 글자 (서버가 시스템 코드로 채움)', () => {
    expect(createWarehouseSchema.parse(input({ code: ' a-01 ' })).code).toBe('A-01')
    expect(createWarehouseSchema.parse(input()).code).toBe('')
  })

  it('센터·창고명 필수, 코드 형식, 보관 조건은 상온·냉장·냉동만', () => {
    expect(
      // 보관 조건은 일부러 없는 값
      errorsOf(input({ centerId: '', name: ' ', code: '창고', storageCondition: 'HOT' as never })),
    ).toMatchObject({
      centerId: ['센터를 골라 주세요.'],
      name: ['창고명을 입력해 주세요.'],
      code: [expect.stringContaining('창고 코드')],
      storageCondition: ['보관 조건을 골라 주세요.'],
    })
    for (const storageCondition of STORAGE_CONDITIONS) {
      expect(errorsOf(input({ storageCondition }))).toEqual({})
    }
  })

  it('유형은 입력받지 않는다 (입고대기는 자동으로만)', () => {
    const parsed = createWarehouseSchema.parse({ ...input(), type: 'INBOUND_STAGING' })
    expect(parsed).not.toHaveProperty('type')
  })
})
