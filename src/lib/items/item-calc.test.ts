import { describe, expect, it } from 'vitest'
import {
  calcPallet,
  cbmOf,
  checkBarcode,
  checkUnitLadder,
  densityWarning,
  gs1CheckDigit,
  palletBoxQty,
  stackWarning,
} from './item-calc'

// 품목 규격·팔레트 계산 (0083)

const T11 = {
  code: 'T11',
  widthCm: '110',
  depthCm: '110',
  heightCm: '15',
  weightKg: '25',
  maxLoadHeightCm: '180',
  maxLoadWeightKg: '1000',
}

describe('CBM · 밀도', () => {
  it('가로×세로×높이(cm) ÷ 1,000,000, 하나라도 비면 null', () => {
    expect(cbmOf('52', '36', '28')).toBe('0.052416')
    expect(cbmOf('110', '110', '183')).toBe('2.214300')
    expect(cbmOf('0.5', '0.5', '0.5')).toBe('0.000000')
    expect(cbmOf('52', '', '28')).toBeNull()
  })

  it('밀도가 비정상이면 경고 (mm로 넣으면 체적 1000배 → 밀도 1/1000)', () => {
    expect(densityWarning('BOX', '0.052416', '5.4')).toBeNull() // 103 kg/m³
    expect(densityWarning('BOX', cbmOf('520', '360', '280'), '5.4')).toMatchObject({
      code: 'DENSITY_SUSPICIOUS',
      level: 'BOX',
    })
    expect(densityWarning('BOX', null, '5.4')).toBeNull()
  })
})

describe('팔레트 계산', () => {
  const box = { convQty: '40', heightCm: '28', grossWeightKg: '5.4' }

  it('TI×HI → 박스 수·환산수량·높이·중량·CBM, 권장 높이를 넘으면 경고', () => {
    const result = calcPallet(box, T11, { ti: 8, hi: 6 })
    expect(result).toMatchObject({
      boxQty: 48,
      convQty: '1920',
      widthCm: '110.00',
      depthCm: '110.00',
      heightCm: '183.00',
      grossWeightKg: '284.200',
      cbm: '2.214300',
    })
    expect(result?.warnings.map((w) => w.code)).toEqual(['PALLET_HEIGHT_EXCEEDED'])
    expect(calcPallet(box, T11, { ti: 8, hi: 5 })?.warnings).toEqual([])
  })

  it('TI·HI가 없으면 직접 넣은 팔레트당 박스 수, 둘 다 없으면 계산 안 함', () => {
    expect(palletBoxQty({ ti: 8, hi: 5, boxQty: 99 })).toBe(40)
    expect(calcPallet(box, T11, { boxQty: 30 })).toMatchObject({
      boxQty: 30,
      convQty: '1200',
      heightCm: null,
    })
    expect(calcPallet(box, null, { ti: 8, hi: 5 })).toMatchObject({
      convQty: '1600',
      widthCm: null,
      cbm: null,
    })
    expect(calcPallet(box, T11, {})).toBeNull()
  })

  it('KG 기본단위: 1 BOX = 10.5 KG → PLT 환산수량도 소수', () => {
    expect(calcPallet({ convQty: '10.5' }, null, { ti: 4, hi: 3 })?.convQty).toBe('126')
    expect(calcPallet({ convQty: '10.25' }, null, { boxQty: 3 })?.convQty).toBe('30.75')
  })

  it('최대 적층이 팔레트 단수보다 작으면 경고', () => {
    expect(stackWarning(4, 6)?.code).toBe('STACK_LIMIT_CONFLICT')
    expect(stackWarning(6, 6)).toBeNull()
    expect(stackWarning(null, 6)).toBeNull()
  })
})

describe('단위 사다리', () => {
  it('상위 레벨 환산수량이 하위보다 커야 하고, BOX가 INNER의 배수가 아니면 경고', () => {
    expect(
      checkUnitLadder([
        { level: 'BASE', unitCode: 'EA', convQty: '1' },
        { level: 'INNER', unitCode: 'PK', convQty: '6' },
        { level: 'BOX', unitCode: 'BOX', convQty: '24' },
        { level: 'PLT', unitCode: 'PLT', convQty: '960' },
      ]),
    ).toEqual({ errors: [], warnings: [] })
    const bad = checkUnitLadder([
      { level: 'BASE', unitCode: 'EA', convQty: '1' },
      { level: 'INNER', unitCode: 'PK', convQty: '7' },
      { level: 'BOX', unitCode: 'BOX', convQty: '24' },
    ])
    expect(bad.warnings.map((w) => w.code)).toEqual(['UOM_NOT_MULTIPLE'])
    // BOX가 기본보다 작음
    expect(
      checkUnitLadder([
        { level: 'BASE', unitCode: 'EA', convQty: '1' },
        { level: 'BOX', unitCode: 'BOX', convQty: '0.5' },
      ]).errors,
    ).toHaveLength(1)
  })
})

describe('바코드 체크디지트', () => {
  it('GS1 mod10: EAN-13·ITF-14·EAN-8·UPC-A', () => {
    // 정의서 예시 8801045570017은 체크디지트가 틀린 값 (맞는 값은 …0013)
    expect(gs1CheckDigit('880104557001')).toBe(3)
    expect(checkBarcode('EAN13', '8801045570013')).toBeNull()
    expect(checkBarcode('EAN13', '8801045570017')).toContain('체크디지트')
    expect(checkBarcode('EAN13', '880104557001')).toContain('13자리')
    expect(checkBarcode('ITF14', '00012345600012')).toBeNull()
    expect(checkBarcode('ITF14', '18801045570014')).toContain('체크디지트')
    expect(checkBarcode('EAN8', '96385074')).toBeNull()
    expect(checkBarcode('UPCA', '036000291452')).toBeNull()
  })

  it('체크디지트가 없는 종류는 글자 모양만', () => {
    expect(checkBarcode('CUSTOM', 'ABC-123')).toBeNull()
    expect(checkBarcode('CODE128', 'has space')).toContain('공백')
  })
})
