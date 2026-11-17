import { describe, expect, it } from 'vitest'
import { jusoSearcher, parseJusoResponse } from './juso-client'

// 도로명주소 검색 API 응답 해석

const juso = {
  roadAddrPart1: '서울특별시 강남구 테헤란로 152',
  jibunAddr: '서울특별시 강남구 역삼동 737 강남파이낸스센터',
  zipNo: '06236',
  admCd: '1168010100',
  bdMgtSn: '1168010100107370000000001',
  bdNm: '강남파이낸스센터',
}

describe('parseJusoResponse', () => {
  it('정상 응답 → 후보 목록과 전체 건수', () => {
    expect(
      parseJusoResponse({
        results: { common: { errorCode: '0', totalCount: '1' }, juso: [juso] },
      }),
    ).toEqual({
      status: 'OK',
      total: 1,
      hits: [
        {
          roadAddress: juso.roadAddrPart1,
          jibunAddress: juso.jibunAddr,
          zipCode: '06236',
          bjdCode: '1168010100',
          bdMgtSn: juso.bdMgtSn,
          buildingName: '강남파이낸스센터',
        },
      ],
    })
  })

  it('승인키 오류는 사용 불가, 검색어 오류는 0건', () => {
    expect(
      parseJusoResponse({
        results: { common: { errorCode: 'E0001', errorMessage: '승인되지 않은 KEY' } },
      }),
    ).toMatchObject({ status: 'UNAVAILABLE' })
    expect(parseJusoResponse({ results: { common: { errorCode: 'E0006' } } })).toEqual({
      status: 'OK',
      total: 0,
      hits: [],
    })
  })
})

describe('jusoSearcher', () => {
  it('승인키가 없으면 API를 부르지 않고 사용 불가', async () => {
    expect(await jusoSearcher('')('서울 강남구 테헤란로 152')).toMatchObject({
      status: 'UNAVAILABLE',
      reason: expect.stringContaining('JUSO_CONFM_KEY'),
    })
  })
})
