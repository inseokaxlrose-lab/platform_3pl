import { describe, expect, it } from 'vitest'
import { warehouseCodeField } from '@/lib/warehouses/warehouse-schema'
import { LOCATION_CODE_PATTERN } from './location-pattern'
import {
  buildLocationBarcode,
  LOCATION_BARCODE_SEPARATOR,
  splitLocationScan,
} from './location-barcode'

// 로케이션 바코드 = 창고코드.로케이션코드 (0084 ⑤)
describe('로케이션 바코드', () => {
  it('만들기·나누기: 창고코드와 로케이션코드를 마침표로 잇고, 스캔한 글자는 대문자로 나눈다', () => {
    expect(buildLocationBarcode('STORAGE1', 'A-01-02')).toBe('STORAGE1.A-01-02')
    expect(splitLocationScan(' storage1.a-01-02 ')).toEqual({
      warehouseCode: 'STORAGE1',
      locationCode: 'A-01-02',
    })
    // 사람이 로케이션코드만 친 경우
    expect(splitLocationScan('a-01-02')).toEqual({ warehouseCode: null, locationCode: 'A-01-02' })
    // 바코드 모양이 아님
    expect(splitLocationScan('')).toBeNull()
    expect(splitLocationScan('A.B.C')).toBeNull()
    expect(splitLocationScan('.A-01')).toBeNull()
  })

  it('구분자는 창고코드·로케이션코드에 쓸 수 없는 글자다', () => {
    expect(LOCATION_CODE_PATTERN.test(`A${LOCATION_BARCODE_SEPARATOR}1`)).toBe(false)
    expect(warehouseCodeField.safeParse(`WH${LOCATION_BARCODE_SEPARATOR}1`).success).toBe(false)
  })
})
