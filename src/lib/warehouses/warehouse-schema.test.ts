import { describe, expect, it } from 'vitest'
import { pickSystemTempZone, WAREHOUSE_TYPE, WAREHOUSE_TYPE_DEFAULTS } from './warehouse-codes'
import { warehouseCreateSchema, type WarehouseCreateInput } from './warehouse-schema'

// 창고 입력 규칙·유형 기본값 (docs/decisions/0074)

const valid: WarehouseCreateInput = {
  centerId: '1',
  code: 'a01',
  name: ' 상온 1창고 ',
  type: 'STORAGE',
  tempZone: 'AMBIENT',
  description: '',
  sortOrder: 10,
  remark: '',
  buildingName: '',
  floorNo: '',
  areaM2: '',
  inbound: true,
  outbound: true,
  allocatable: true,
  defaultStockStatus: 'NORMAL',
  allocPriority: 100,
  defaultLocId: '',
}

const errorsOf = (input: Partial<WarehouseCreateInput>) => {
  const result = warehouseCreateSchema.safeParse({ ...valid, ...input })
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]))
}

describe('창고 입력 규칙', () => {
  it('코드는 대문자로, 글자는 앞뒤 공백 제거, 빈 칸은 null', () => {
    const parsed = warehouseCreateSchema.parse(valid)
    expect(parsed).toMatchObject({
      centerId: 1n,
      code: 'A01',
      name: '상온 1창고',
      description: null,
      areaM2: null,
      defaultLocId: null,
    })
  })

  it('창고코드: 필수, 영문 대문자·숫자·밑줄 20자', () => {
    expect(errorsOf({ code: '' }).code).toBe('창고코드를 입력해 주세요.')
    expect(errorsOf({ code: 'A-1' }).code).toMatch(/밑줄/)
    expect(errorsOf({ code: 'COLD_1' }).code).toBeUndefined()
    expect(errorsOf({ code: 'X'.repeat(21) }).code).toMatch(/20자/)
  })

  it('유형·온도대·재고상태는 정해진 값만, 할당 우선순위 1~999', () => {
    expect(errorsOf({ type: 'GENERAL' }).type).toBeDefined()
    expect(errorsOf({ tempZone: 'HOT' }).tempZone).toBeDefined()
    expect(errorsOf({ defaultStockStatus: 'OK' }).defaultStockStatus).toBeDefined()
    expect(errorsOf({ allocPriority: 0 }).allocPriority).toBeDefined()
    expect(errorsOf({ allocPriority: 1000 }).allocPriority).toBeDefined()
  })

  it('2차 칸은 보내지 않아도 되고, 보내면 검사한다', () => {
    expect(warehouseCreateSchema.parse(valid).bondedYn).toBeUndefined()
    expect(
      warehouseCreateSchema.parse({ ...valid, locCodePrefix: 'a', locCodeSeparator: '' }),
    ).toMatchObject({ locCodePrefix: 'A', locCodeSeparator: null })
    expect(warehouseCreateSchema.safeParse({ ...valid, locCodePrefix: 'A-' }).success).toBe(false)
  })
})

describe('창고 유형 기본값', () => {
  it('모든 유형에 기본값이 있고, 일반 보관만 출고 할당 가능', () => {
    for (const type of WAREHOUSE_TYPE.values) expect(WAREHOUSE_TYPE_DEFAULTS[type]).toBeDefined()
    const allocatable = WAREHOUSE_TYPE.values.filter((t) => WAREHOUSE_TYPE_DEFAULTS[t].allocatable)
    expect(allocatable).toEqual(['STORAGE'])
    expect(WAREHOUSE_TYPE_DEFAULTS.RETURN.defaultStockStatus).toBe('HOLD')
    expect(WAREHOUSE_TYPE_DEFAULTS.DAMAGED.defaultStockStatus).toBe('DAMAGED')
  })

  it('기본 창고 온도대: 상온 우선, 없으면 상수 순서의 첫 번째, 비면 상온', () => {
    expect(pickSystemTempZone(['FROZEN', 'AMBIENT'])).toBe('AMBIENT')
    expect(pickSystemTempZone(['FROZEN', 'CHILLED'])).toBe('CHILLED')
    expect(pickSystemTempZone([])).toBe('AMBIENT')
  })
})
