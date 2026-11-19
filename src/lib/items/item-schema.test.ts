import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { barcodeRow, itemInput, unitRow, withExpiry, withLot } from '@/test/item-input'
import {
  effectiveItemOptions,
  itemCreateSchema,
  itemSchema,
  MAX_ITEM_BARCODES,
  type ItemInput,
} from './item-schema'

// 품목 입력 규칙 (0041, 0083) — 화면·서버 공용. DB가 필요한 검사(단위 종류·바코드 중복)는 items 서비스 테스트에서

const EA = '1'
const BOX = '2'
const PLT = '3'
const input = (overrides: Partial<ItemInput> = {}) => itemInput(EA, overrides)

// 칸별 첫 오류 글 (path를 점으로 이은 키)
const errorsOf = (value: unknown, schema: z.ZodType = itemSchema) => {
  const parsed = schema.safeParse(value)
  if (parsed.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of parsed.error.issues) errors[issue.path.join('.')] ??= issue.message
  return errors
}

describe('품목 입력 규칙 — 기본', () => {
  it('정리해서 저장할 값을 만든다 (빈 칸 null, 키는 bigint, 국가·통화 대문자)', () => {
    expect(
      itemSchema.parse(
        input({ name: ' 생수 ', originCountry: 'kr', currency: 'krw', itemValue: '1,200' }),
      ),
    ).toMatchObject({
      name: '생수',
      spec: null,
      originCountry: 'KR',
      currency: 'KRW',
      itemValue: '1200',
      baseUnitId: 1n,
      defaultInboundUnitId: null,
      palletTypeCode: null,
      expiryType: null,
      units: [{ level: 'BASE', unitId: 1n, convQty: '1', widthCm: null }],
    })
  })

  it('등록: 화주사·품목코드 필수, 품목코드는 대문자로 정리하고 영문·숫자·점·하이픈·밑줄 50자까지', () => {
    const create = (code: string, shipperId = '9') => ({ ...input(), shipperId, code })
    expect(itemCreateSchema.parse(create(' sku-001.a_1 ')).code).toBe('SKU-001.A_1')
    expect(errorsOf(create('', ''), itemCreateSchema)).toMatchObject({
      shipperId: '화주사를 골라 주세요.',
      code: '품목코드를 입력해 주세요.',
    })
    expect(errorsOf(create('SKU 1'), itemCreateSchema).code).toContain('영문·숫자')
    expect(errorsOf(create('A'.repeat(51)), itemCreateSchema).code).toContain('50자')
    // 수정 입력에는 품목코드가 없다 (보내도 무시)
    expect(itemSchema.parse({ ...input(), code: 'X' })).not.toHaveProperty('code')
  })

  it('품목 유형·온도대는 정해진 값, 원산지·HS·온도 범위 형식', () => {
    expect(
      errorsOf(
        input({
          itemType: 'X' as never,
          tempZone: '' as never,
          originCountry: 'KOR',
          hsCode: '12',
          storageTempMin: '10',
          storageTempMax: '2',
        }),
      ),
    ).toMatchObject({
      itemType: expect.any(String),
      tempZone: expect.any(String),
      originCountry: expect.stringContaining('두 글자'),
      hsCode: expect.stringContaining('HS'),
      storageTempMax: '최고온도는 최저온도보다 높아야 합니다.',
    })
  })
})

describe('품목 입력 규칙 — 기한·LOT (조건부 필수)', () => {
  it('기한 관리 품목은 기한 종류·입력 방식 필수, 제조일 입력이면 총 기한 일수도 필수', () => {
    expect(errorsOf(input({ useExpiry: true }))).toMatchObject({
      expiryType: expect.stringContaining('기한 종류'),
      expiryInput: expect.stringContaining('입력 방식'),
    })
    expect(errorsOf(input({ ...withExpiry, expiryInput: 'MFG' }))).toEqual({
      shelfLifeDays: '제조일로 기한을 계산하려면 총 기한 일수가 필요합니다.',
    })
    expect(errorsOf(input({ ...withExpiry, expiryInput: 'BOTH', shelfLifeDays: 365 }))).toEqual({})
  })

  it('기한을 관리하지 않으면 기한 칸은 비어 있어도 된다, LOT 관리 품목은 생성 방식 필수', () => {
    expect(errorsOf(input({ useExpiry: false, expiryType: '', expiryInput: '' }))).toEqual({})
    expect(errorsOf(input({ useLot: true }))).toEqual({
      lotSource: 'LOT 관리 품목은 LOT 생성 방식을 골라 주세요.',
    })
    expect(errorsOf(input(withLot))).toEqual({})
  })

  it('일수·TI·HI는 정수, 범위 안', () => {
    expect(
      errorsOf(input({ ...withExpiry, expiryAlertDays: 0, palletTi: 1.5, palletHi: 1000 })),
    ).toMatchObject({
      expiryAlertDays: expect.stringContaining('1 이상'),
      palletTi: '정수로 입력해 주세요.',
      palletHi: expect.stringContaining('999 이하'),
    })
  })
})

describe('품목 입력 규칙 — 단위 표', () => {
  it('기본단위(BASE) 행이 꼭 있고, 그 단위는 기본단위·환산수량 1', () => {
    expect(errorsOf(input({ units: [] }))).toEqual({ units: '기본단위 행이 필요합니다.' })
    expect(errorsOf(input({ units: [unitRow('BASE', BOX, '1')] }))).toEqual({
      units: '기본단위 행의 단위는 기본단위와 같아야 합니다.',
    })
    expect(errorsOf(input({ units: [unitRow('BASE', EA, '2')] }))).toEqual({
      units: '기본단위 행의 환산수량은 1입니다.',
    })
  })

  it('레벨별 1행, 같은 단위를 두 레벨에 쓸 수 없음, 환산수량은 0보다 큼 (쉼표 허용)', () => {
    const base = unitRow('BASE', EA, '1')
    expect(
      errorsOf(input({ units: [base, unitRow('BOX', BOX, '24'), unitRow('BOX', PLT, '48')] })),
    ).toEqual({ 'units.2.level': 'BOX 단위가 두 번 있습니다.' })
    expect(
      errorsOf(input({ units: [base, unitRow('BOX', BOX, '24'), unitRow('PLT', BOX, '480')] })),
    ).toEqual({ 'units.2.unitId': '같은 단위를 두 레벨에 쓸 수 없습니다.' })
    expect(errorsOf(input({ units: [base, unitRow('BOX', BOX, '0')] }))).toEqual({
      'units.1.convQty': '환산수량을 0보다 크게 입력해 주세요.',
    })
    expect(
      itemSchema.parse(input({ units: [base, unitRow('PLT', PLT, '1,440')] })).units[1].convQty,
    ).toBe('1440')
  })

  it('규격은 비우거나 소수 (cm 소수 2자리, kg 소수 3자리)', () => {
    const box = unitRow('BOX', BOX, '24', { widthCm: '30.123', grossWeightKg: '12.5' })
    expect(errorsOf(input({ units: [unitRow('BASE', EA, '1'), box] }))).toEqual({
      'units.1.widthCm': expect.any(String),
    })
  })
})

describe('품목 입력 규칙 — 바코드', () => {
  const units = [unitRow('BASE', EA, '1'), unitRow('BOX', BOX, '24')]

  it('품목 안에서 같은 바코드 두 번 금지, 이 품목의 단위만, 대표는 단위별 1개', () => {
    expect(
      errorsOf(
        input({
          units,
          barcodes: [
            barcodeRow(EA, '8801234567893', { isPrimary: true }),
            barcodeRow(EA, '8801234567893'),
            barcodeRow(PLT, '8801234567886'),
          ],
        }),
      ),
    ).toEqual({
      'barcodes.1.barcode': '같은 바코드가 두 번 있습니다.',
      'barcodes.2.unitId': '이 품목의 단위가 아닙니다.',
    })
    expect(
      errorsOf(
        input({
          units,
          barcodes: [
            barcodeRow(EA, '8801234567893', { isPrimary: true }),
            barcodeRow(EA, '8801234567886', { isPrimary: true }),
          ],
        }),
      ),
    ).toEqual({ barcodes: '대표 바코드는 단위별 1개입니다.' })
  })

  it(`바코드는 ${MAX_ITEM_BARCODES}개까지`, () => {
    const many = Array.from({ length: MAX_ITEM_BARCODES + 1 }, (_, i) =>
      barcodeRow(EA, `X${i}`, { barcodeType: 'CUSTOM' }),
    )
    expect(errorsOf(input({ units, barcodes: many })).barcodes).toContain(
      `${MAX_ITEM_BARCODES}개까지`,
    )
  })
})

describe('effectiveItemOptions (실제로 적용되는 관리 옵션)', () => {
  const shipper = { useLot: true, useExpiry: false, labelUnit: 'PLT' as const }

  it('품목의 명시값(true/false·Y/N)을 따르고, 옛 데이터처럼 비어 있으면 화주사 값', () => {
    expect(
      effectiveItemOptions({ useLot: false, useExpiry: true, labelUnit: '' }, shipper),
    ).toEqual({
      useLot: false,
      useExpiry: true,
      labelUnit: 'PLT',
    })
    expect(
      effectiveItemOptions({ useLot: 'N', useExpiry: 'Y', labelUnit: 'BOX' }, shipper),
    ).toEqual({
      useLot: false,
      useExpiry: true,
      labelUnit: 'BOX',
    })
    expect(effectiveItemOptions({ useLot: null, useExpiry: '', labelUnit: null }, shipper)).toEqual(
      {
        useLot: true,
        useExpiry: false,
        labelUnit: 'PLT',
      },
    )
  })
})
