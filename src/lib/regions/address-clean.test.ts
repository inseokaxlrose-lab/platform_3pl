import { describe, expect, it } from 'vitest'
import { addressCacheKey, cleanAddress, cleanZip } from './address-clean'

// 주소 문자열 정리 (정제 ②단계)

describe('cleanAddress', () => {
  it.each([
    // [원본, 검색어, 상세주소]
    [
      '서울특별시 강남구 테헤란로 152 (역삼동, 강남파이낸스센터) 12층',
      '서울특별시 강남구 테헤란로 152',
      '12층',
    ],
    [
      '서울 강남구 역삼동 737 강남파이낸스센터 12층',
      '서울 강남구 역삼동 737',
      '강남파이낸스센터 12층',
    ],
    [
      '경기 수원시 권선구 권선동 1234-5 101동 202호',
      '경기 수원시 권선구 권선동 1234-5',
      '101동 202호',
    ],
    ['경기도  수원시\t권선구   세권로 88-1, 3층', '경기도 수원시 권선구 세권로 88-1', '3층'],
    ['서울 종로구 세종대로 지하 172', '서울 종로구 세종대로 지하 172', null],
    ['서울특별시 종로구 종로1가 1 교보빌딩', '서울특별시 종로구 종로1가 1', '교보빌딩'],
    ['경기 이천시 마장면 이치리 산 12', '경기 이천시 마장면 이치리 산 12', null],
    // 건물번호를 못 찾으면 층·호만 뗀다
    ['서울 강남구 어딘가빌딩 3층 301호', '서울 강남구 어딘가빌딩', '3층 301호'],
  ])('%s', (address, keyword, detail) => {
    expect(cleanAddress(address)).toEqual({ keyword, detail })
  })

  it('따로 들어온 상세주소를 붙인다', () => {
    expect(cleanAddress('서울 강남구 테헤란로 152', ' 12층 ')).toEqual({
      keyword: '서울 강남구 테헤란로 152',
      detail: '12층',
    })
  })
})

describe('cleanZip', () => {
  it('5자리는 신우편번호, 6자리(하이픈 포함)는 구우편번호, 그 밖은 없음', () => {
    expect(cleanZip('06236')).toEqual({ zip5: '06236', zip6: null })
    expect(cleanZip('135-080')).toEqual({ zip5: null, zip6: '135080' })
    expect(cleanZip('12')).toEqual({ zip5: null, zip6: null })
    expect(cleanZip(null)).toEqual({ zip5: null, zip6: null })
  })
})

describe('addressCacheKey', () => {
  it('띄어쓰기·괄호·상세주소만 다르면 같은 키, 우편번호가 다르면 다른 키', () => {
    const key = addressCacheKey('서울 강남구 테헤란로 152', '06236')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(addressCacheKey('서울  강남구 테헤란로152 (역삼동) 12층', '06236')).toBe(key)
    expect(addressCacheKey('서울 강남구 테헤란로 152', '06237')).not.toBe(key)
  })
})
