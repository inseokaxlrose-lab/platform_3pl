import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  effectiveItemOptions,
  itemCreateSchema,
  itemSchema,
  MAX_ITEM_UNITS,
  type ItemInput,
} from './item-schema'

const input = (overrides: Partial<ItemInput> = {}): ItemInput => ({
  code: ' sku-001 ',
  name: ' 생수 500ml ',
  spec: '',
  barcode: '',
  baseUnitId: '1',
  useLot: '',
  useExpiry: 'Y',
  labelUnit: '',
  expiryAlertDays: '30',
  remark: '',
  units: [{ unitId: '2', convQty: '24' }],
  ...overrides,
})

const errorsOf = (value: ItemInput) => {
  const parsed = itemSchema.safeParse(value)
  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors
}

describe('품목 입력 규칙 (0041)', () => {
  it('정리해서 저장할 값을 만든다 (품목코드 대문자, 빈 칸 null, 키·숫자로)', () => {
    expect(itemSchema.parse(input())).toMatchObject({
      code: 'SKU-001',
      name: '생수 500ml',
      spec: null,
      barcode: null,
      baseUnitId: 1n,
      useLot: '',
      expiryAlertDays: 30,
      units: [{ unitId: 2n, convQty: '24' }],
    })
  })

  it('품목코드는 비우거나 영문·숫자·점·하이픈·밑줄 2~30자, 품목명·기본단위는 필수', () => {
    expect(itemSchema.parse(input({ code: '' })).code).toBe('')
    expect(itemSchema.parse(input({ code: 'a.b_c-1' })).code).toBe('A.B_C-1')
    expect(errorsOf(input({ code: '생수', name: ' ', baseUnitId: '' }))).toMatchObject({
      code: [expect.stringContaining('품목코드')],
      name: ['품목명을 입력해 주세요.'],
      baseUnitId: ['기본단위를 골라 주세요.'],
    })
    expect(errorsOf(input({ code: 'A' })).code).toBeTruthy()
  })

  it('바코드는 영문·숫자·하이픈, 임박 기준은 1~3650일', () => {
    expect(errorsOf(input({ barcode: '880 123', expiryAlertDays: '0' }))).toMatchObject({
      barcode: ['바코드는 영문·숫자·하이픈입니다.'],
      expiryAlertDays: ['1~3650일로 입력해 주세요.'],
    })
    expect(itemSchema.parse(input({ expiryAlertDays: '' })).expiryAlertDays).toBeNull()
  })

  it(`환산단위: 단위·입수량(0보다 큼) 필수, 같은 단위 두 번 금지, 최대 ${MAX_ITEM_UNITS}개`, () => {
    const issues = itemSchema
      .safeParse(
        input({
          units: [
            { unitId: '', convQty: '0' },
            { unitId: '2', convQty: '24' },
            { unitId: '2', convQty: '-1' },
          ],
        }),
      )
      .error!.issues.map((i) => [i.path.join('.'), i.message])
    expect(issues).toEqual(
      expect.arrayContaining([
        ['units.0.unitId', '환산단위를 골라 주세요.'],
        ['units.0.convQty', '입수량을 0보다 크게 입력해 주세요.'],
        ['units.2.convQty', '입수량을 0보다 크게 입력해 주세요.'],
      ]),
    )
    expect(
      itemSchema
        .safeParse(
          input({
            units: [
              { unitId: '2', convQty: '24' },
              { unitId: '2', convQty: '6' },
            ],
          }),
        )
        .error!.issues.map((i) => [i.path.join('.'), i.message]),
    ).toEqual([['units.1.unitId', '이미 넣은 환산단위입니다.']])
    expect(
      errorsOf(
        input({
          units: Array.from({ length: MAX_ITEM_UNITS + 1 }, (_, i) => ({
            unitId: String(i + 2),
            convQty: '1',
          })),
        }),
      ).units,
    ).toEqual([`환산단위는 ${MAX_ITEM_UNITS}개까지 등록할 수 있습니다.`])
  })

  it('등록은 화주사를 고른다', () => {
    expect(
      itemCreateSchema.safeParse({ ...input(), shipperId: '' }).error!.issues[0],
    ).toMatchObject({
      path: ['shipperId'],
      message: '화주사를 골라 주세요.',
    })
  })
})

describe('effectiveItemOptions (실제로 적용되는 관리 옵션)', () => {
  const shipper = { useLot: true, useExpiry: false, labelUnit: 'PLT' as const }

  it('비어 있으면 화주사 기본값, 정하면 그 값', () => {
    expect(effectiveItemOptions({ useLot: '', useExpiry: null, labelUnit: '' }, shipper)).toEqual({
      useLot: true,
      useExpiry: false,
      labelUnit: 'PLT',
    })
    expect(
      effectiveItemOptions({ useLot: 'N', useExpiry: 'Y', labelUnit: 'BOX' }, shipper),
    ).toEqual({
      useLot: false,
      useExpiry: true,
      labelUnit: 'BOX',
    })
  })
})
