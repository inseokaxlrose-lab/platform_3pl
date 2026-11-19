import { describe, expect, it } from 'vitest'
import {
  calcItemVolumeIn,
  convertItemQtyIn,
  splitByUomIn,
  toItemBaseQtyIn,
  type ItemUomTable,
} from './item-uom'

// 품목 단위 환산 (0083) — 정의서의 테스트 케이스: EA 기본, KG 기본, INNER 포함, PLT, 체적 미등록

// 생수: 1 BOX = 24 EA (30×20×25cm = 0.015 CBM, 12kg), 1 PLT = 40 BOX = 960 EA
const WATER: ItemUomTable = {
  baseUnitCode: 'EA',
  units: [
    { level: 'BASE', unitCode: 'EA', convQty: '1', decimals: 0 },
    {
      level: 'BOX',
      unitCode: 'BOX',
      convQty: '24',
      decimals: 0,
      cbm: '0.015',
      grossWeightKg: '12',
    },
    {
      level: 'PLT',
      unitCode: 'PLT',
      convQty: '960',
      decimals: 0,
      cbm: '1.694',
      grossWeightKg: '505',
    },
  ],
}

// 쌀: 기본단위 KG(소수 3자리), 1 BOX = 2.5 KG
const RICE: ItemUomTable = {
  baseUnitCode: 'KG',
  units: [
    { level: 'BASE', unitCode: 'KG', convQty: '1', decimals: 3 },
    { level: 'BOX', unitCode: 'BOX', convQty: '2.5', decimals: 0 },
  ],
}

// 과자: 1 INNER(CS) = 6 EA, 1 BOX = 24 EA, 낱개 규격 있음
const SNACK: ItemUomTable = {
  baseUnitCode: 'EA',
  units: [
    {
      level: 'BASE',
      unitCode: 'EA',
      convQty: '1',
      decimals: 0,
      cbm: '0.0005',
      grossWeightKg: '0.4',
    },
    { level: 'INNER', unitCode: 'CS', convQty: '6', decimals: 0 },
    {
      level: 'BOX',
      unitCode: 'BOX',
      convQty: '24',
      decimals: 0,
      cbm: '0.015',
      grossWeightKg: '10',
    },
  ],
}

describe('toItemBaseQtyIn (재고 저장 직전 기본단위로)', () => {
  it('EA 기본: 3 BOX → 72 EA, 2 PLT → 1920 EA, 기본단위는 그대로', () => {
    expect(toItemBaseQtyIn(WATER, '3', 'BOX')).toBe('72')
    expect(toItemBaseQtyIn(WATER, '2', 'PLT')).toBe('1920')
    expect(toItemBaseQtyIn(WATER, '5', 'EA')).toBe('5')
  })

  it('KG 기본: 3 BOX → 7.5 KG, KG은 소수 3자리까지', () => {
    expect(toItemBaseQtyIn(RICE, '3', 'BOX')).toBe('7.5')
    expect(toItemBaseQtyIn(RICE, '1.25', 'KG')).toBe('1.25')
    expect(() => toItemBaseQtyIn(RICE, '1.2345', 'KG')).toThrow('소수 3자리')
  })

  it('포장 단위·EA는 정수만, 이 품목에 없는 단위는 오류', () => {
    expect(() => toItemBaseQtyIn(WATER, '1.5', 'BOX')).toThrow('정수로만')
    expect(() => toItemBaseQtyIn(WATER, '1', 'CS')).toThrow('없는 단위')
    expect(() => toItemBaseQtyIn(WATER, '-1', 'BOX')).toThrow('0 이상')
  })
})

describe('convertItemQtyIn (품목 단위 간 환산)', () => {
  it('나누어떨어지면 그대로: 2 PLT → 80 BOX, 48 EA → 2 BOX, 2 BOX → 5 KG', () => {
    expect(convertItemQtyIn(WATER, '2', 'PLT', 'BOX')).toEqual({ qty: '80', remainder: '0' })
    expect(convertItemQtyIn(WATER, '48', 'EA', 'BOX')).toEqual({ qty: '2', remainder: '0' })
    expect(convertItemQtyIn(RICE, '2', 'BOX', 'KG')).toEqual({ qty: '5', remainder: '0' })
  })

  it('나누어떨어지지 않으면 오류, remainder 옵션이면 내림 + 나머지(기본단위)', () => {
    expect(() => convertItemQtyIn(WATER, '100', 'EA', 'BOX')).toThrow('나누어떨어지지 않습니다')
    expect(convertItemQtyIn(WATER, '100', 'EA', 'BOX', { remainder: true })).toEqual({
      qty: '4',
      remainder: '4',
    })
    // KG → BOX(2.5): 6 KG = 2 BOX + 1 KG
    expect(convertItemQtyIn(RICE, '6', 'KG', 'BOX', { remainder: true })).toEqual({
      qty: '2',
      remainder: '1',
    })
  })

  it('INNER 포함: 2 BOX → 8 CS, 15 EA → 2 CS + 3 EA', () => {
    expect(convertItemQtyIn(SNACK, '2', 'BOX', 'CS')).toEqual({ qty: '8', remainder: '0' })
    expect(convertItemQtyIn(SNACK, '15', 'EA', 'CS', { remainder: true })).toEqual({
      qty: '2',
      remainder: '3',
    })
  })
})

describe('splitByUomIn (큰 단위부터 나누기)', () => {
  it('PLT: 1,000 EA → 1 PLT · 1 BOX · 16 EA', () => {
    expect(splitByUomIn(WATER, '1000')).toEqual([
      { unit: 'PLT', qty: '1' },
      { unit: 'BOX', qty: '1' },
      { unit: 'EA', qty: '16' },
    ])
  })

  it('INNER 포함: 35 EA → 1 BOX · 1 CS · 5 EA / KG: 6 KG → 2 BOX · 1 KG / 0 → 0 EA', () => {
    expect(splitByUomIn(SNACK, '35')).toEqual([
      { unit: 'BOX', qty: '1' },
      { unit: 'CS', qty: '1' },
      { unit: 'EA', qty: '5' },
    ])
    expect(splitByUomIn(RICE, '6')).toEqual([
      { unit: 'BOX', qty: '2' },
      { unit: 'KG', qty: '1' },
    ])
    expect(splitByUomIn(WATER, '0')).toEqual([{ unit: 'EA', qty: '0' }])
  })
})

describe('calcItemVolumeIn (수량의 체적·중량)', () => {
  it('BOX 규격 기준, 낱개 규격이 없으면 나머지는 BOX를 비례로: 60 EA = 2 BOX + 12 EA', () => {
    expect(calcItemVolumeIn(WATER, '60')).toEqual({
      status: 'OK',
      cbm: '0.0375', // 2 × 0.015 + 12/24 × 0.015
      grossWeightKg: '30', // 2 × 12 + 12/24 × 12
      boxes: '2',
      remainder: '12',
    })
  })

  it('낱개 규격이 있으면 나머지는 낱개 규격으로: 30 EA = 1 BOX + 6 EA', () => {
    expect(calcItemVolumeIn(SNACK, '30')).toEqual({
      status: 'OK',
      cbm: '0.018', // 0.015 + 6 × 0.0005
      grossWeightKg: '12.4', // 10 + 6 × 0.4
      boxes: '1',
      remainder: '6',
    })
  })

  it('체적 미등록: BOX가 없거나 BOX 규격이 없으면 null + 사유', () => {
    expect(calcItemVolumeIn(RICE, '10')).toMatchObject({
      status: 'VOLUME_MISSING',
      cbm: null,
      reason: expect.stringContaining('BOX 규격'),
    })
    expect(
      calcItemVolumeIn(
        {
          baseUnitCode: 'EA',
          units: [{ level: 'BASE', unitCode: 'EA', convQty: '1', decimals: 0 }],
        },
        '1',
      ),
    ).toMatchObject({ status: 'VOLUME_MISSING', reason: 'BOX 단위가 없습니다.' })
  })
})
