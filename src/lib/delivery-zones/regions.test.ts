import { describe, expect, it } from 'vitest'
import { SIDO_LIST, SIGUNGU_LIST } from '@/config/korea-regions'
import {
  isRegionCode,
  overlapsWithin,
  regionLabel,
  regionsOverlap,
  sortRegions,
  summarizeRegions,
} from './regions'

describe('행정구역 목록 (공식 법정동코드에서 생성)', () => {
  it('시·도 16개(세종 포함), 시·군·구는 모두 있는 시·도에 속하고 코드가 겹치지 않는다', () => {
    expect(SIDO_LIST).toHaveLength(16)
    const sidoCodes = new Set(SIDO_LIST.map((s) => s.code))
    expect(
      SIGUNGU_LIST.every((s) => sidoCodes.has(s.sidoCode) && s.code.startsWith(s.sidoCode)),
    ).toBe(true)
    expect(new Set(SIGUNGU_LIST.map((s) => s.code)).size).toBe(SIGUNGU_LIST.length)
    // 세종은 시·군·구 없이 시·도 하나
    expect(SIGUNGU_LIST.some((s) => s.sidoCode === '36')).toBe(false)
  })
})

describe('담당 지역 코드', () => {
  it('표시 이름: 시·도 전체 / 시·도 + 시·군·구 / 모르는 코드는 그대로', () => {
    expect(regionLabel('11')).toBe('서울특별시 전체')
    expect(regionLabel('11110')).toBe('서울특별시 종로구')
    expect(regionLabel('99999')).toBe('99999')
    expect(isRegionCode('11110')).toBe(true)
    expect(isRegionCode('11999')).toBe(false)
  })

  it('겹침: 같은 코드, 또는 시·도 전체와 그 안의 시·군·구', () => {
    expect(regionsOverlap('11', '11110')).toBe(true)
    expect(regionsOverlap('11110', '11')).toBe(true)
    expect(regionsOverlap('11110', '11110')).toBe(true)
    expect(regionsOverlap('11', '41')).toBe(false)
    expect(regionsOverlap('11110', '11140')).toBe(false)
    expect(overlapsWithin(['41', '11110', '11'])).toEqual([['11110', '11']])
  })

  it('정렬·요약', () => {
    // 시·도 가나다순(경기도 → 서울특별시), 같은 시·도는 전체 먼저 → 시·군·구 가나다순(강남구 → 종로구)
    expect(sortRegions(['11110', '41', '11680', '11'])).toEqual(['41', '11', '11680', '11110'])
    expect(summarizeRegions(['11110'])).toBe('서울특별시 종로구')
    expect(summarizeRegions(['41', '11', '11110', '26'])).toBe(
      '경기도 전체, 부산광역시 전체 외 2곳',
    )
  })
})
