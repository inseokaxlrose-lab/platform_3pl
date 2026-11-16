import { describe, expect, it } from 'vitest'
import { codeSvg } from './barcode'
import { buildLabelPayload, parseLabelPayload } from './label-payload'

// 관리 라벨 2D 코드 글자·그림 (0054)

const fields = {
  labelNo: 'LB261116-00001',
  centerCode: 'ICN',
  shipperCode: 'GANA',
  itemCode: 'WATER',
  lotNo: 'L240101',
  expiryOn: '2027-01-31',
  qty: '1440',
  unit: 'EA',
}

describe('라벨 글자 (형식 버전 1)', () => {
  it('버전이 맨 앞, 칸은 |, 유통기한은 YYYYMMDD, 빈 값은 빈 칸', () => {
    expect(buildLabelPayload(fields)).toBe(
      'L1|LB261116-00001|ICN|GANA|WATER|L240101|20270131|1440|EA',
    )
    expect(buildLabelPayload({ ...fields, lotNo: null, expiryOn: null })).toBe(
      'L1|LB261116-00001|ICN|GANA|WATER|||1440|EA',
    )
  })

  it('값 안의 |는 /로 바꿔 칸이 밀리지 않는다, 다시 읽으면 같은 값', () => {
    const text = buildLabelPayload({ ...fields, lotNo: 'A|B' })
    expect(text.split('|')).toHaveLength(9)
    expect(parseLabelPayload(text)).toMatchObject({
      version: 1,
      lotNo: 'A/B',
      expiryOn: '2027-01-31',
    })
    expect(parseLabelPayload('L2|x')).toBeNull()
    expect(parseLabelPayload('hello')).toBeNull()
  })
})

describe('2D 코드 그림', () => {
  it('QR·Data Matrix 모두 SVG로', () => {
    const text = buildLabelPayload(fields)
    expect(codeSvg('QR', text)).toMatch(/^<svg viewBox="0 0 \d+ \d+"/)
    expect(codeSvg('DATAMATRIX', text)).toMatch(/^<svg viewBox="0 0 \d+ \d+"/)
  })
})
