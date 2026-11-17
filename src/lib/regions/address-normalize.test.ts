import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { runNormalize, type NormalizeDeps } from './address-normalize'
import { buildBjdIndex } from './address-text-parse'
import type { AddressHit, AddressSearcher, SearchResult } from './juso-client'
import { decodeKorean, parseBjdFile } from './region-files'

// 주소 정제 ①~⑥단계 — 가짜 검색기(API 대신)와 샘플 지역 마스터로

const index = buildBjdIndex(
  parseBjdFile(decodeKorean(readFileSync('src/test/fixtures/region/bjd-sample.csv'))).filter(
    (b) => !b.abolished,
  ),
)

const hit = (zipCode: string, bjdCode: string, roadAddress = '도로 1'): AddressHit => ({
  roadAddress,
  jibunAddress: '',
  zipCode,
  bjdCode,
  bdMgtSn: `${bjdCode}0000`,
  buildingName: '',
})
const ok = (...hits: AddressHit[]): SearchResult => ({ status: 'OK', total: hits.length, hits })
const NONE = ok()

// 검색어 → 결과 표 (없는 검색어는 0건)
const searcher = (table: Record<string, SearchResult>): AddressSearcher =>
  vi.fn(async (keyword: string) => table[keyword] ?? NONE)

const deps = (s: AddressSearcher): NormalizeDeps => ({
  searcher: s,
  index,
  findZip: async (zip) =>
    ({
      '16613': { sidoCode: '41', sigunguCode: '41113' },
      '06236': { sidoCode: '11', sigunguCode: '11680' },
    })[zip] ?? null,
})

const GANGNAM = hit('06236', '1168010100', '서울특별시 강남구 테헤란로 152')

describe('runNormalize', () => {
  it('① 원본 그대로 검색해 1건이면 A (원본 검색)', async () => {
    const r = await runNormalize(
      { address: '서울 강남구 테헤란로 152' },
      deps(searcher({ '서울 강남구 테헤란로 152': ok(GANGNAM) })),
    )
    expect(r).toMatchObject({
      grade: 'A',
      method: 'API_EXACT',
      zipCode: '06236',
      bjdCode: '1168010100',
      sigunguCode: '11680',
      sidoCode: '11',
      roadAddress: '서울특별시 강남구 테헤란로 152',
      zipMismatch: false,
      apiUnavailable: null,
    })
  })

  it('② 층·괄호를 지우고 다시 검색해 1건이면 A (정리 후 검색), 상세주소는 따로', async () => {
    const s = searcher({ '서울 강남구 테헤란로 152': ok(GANGNAM) })
    const r = await runNormalize({ address: '서울 강남구 테헤란로 152 (역삼동) 12층' }, deps(s))
    expect(r).toMatchObject({
      grade: 'A',
      method: 'API_CLEANED',
      zipCode: '06236',
      detailAddress: '12층',
    })
    expect(s).toHaveBeenCalledTimes(2)
  })

  it('③ 여러 건이 모두 같은 우편번호면 B, 법정동이 다르면 법정동은 비운다', async () => {
    const r = await runNormalize(
      { address: '권선로 300' },
      deps(searcher({ '권선로 300': ok(hit('16613', '4111312900'), hit('16613', '4111313600')) })),
    )
    expect(r).toMatchObject({
      grade: 'B',
      method: 'MULTI_SAME_ZIP',
      zipCode: '16613',
      bjdCode: null,
      sigunguCode: '41113',
    })
    expect(r.candidates).toHaveLength(2)
  })

  it('여러 건이 우편번호가 다르면 후보를 남기고 글자 해석으로 (C)', async () => {
    const r = await runNormalize(
      { address: '경기 수원시 권선구 권선동 금곡로 1' },
      deps(
        searcher({
          '경기 수원시 권선구 권선동 금곡로 1': ok(
            hit('16613', '4111312900'),
            hit('16625', '4111313700'),
          ),
        }),
      ),
    )
    expect(r).toMatchObject({
      grade: 'C',
      method: 'TEXT_PARSE',
      bjdCode: '4111312900',
      zipCode: null,
    })
    expect(r.candidates).toHaveLength(2)
  })

  it('여러 건 중 검색어와 정확히 같은 주소가 하나뿐이면 A (API의 부분 일치 결과는 버림)', async () => {
    // 실제 API: '용봉로 77' → 용봉로 77 + 용봉로138번길 77
    const yongbong = hit('61186', '1230010700', '전남광주통합특별시 북구 용봉로 77')
    const r = await runNormalize(
      { address: '광주광역시 북구 용봉로 77' },
      deps(
        searcher({
          '광주광역시 북구 용봉로 77': ok(
            yongbong,
            hit('61217', '1230010100', '전남광주통합특별시 북구 용봉로138번길 77'),
          ),
        }),
      ),
    )
    expect(r).toMatchObject({ grade: 'A', method: 'API_EXACT', zipCode: '61186' })
  })

  it('지번 주소도 정확히 같은 1건이면 A (지번 뒤 건물명은 무시), 같은 주소가 둘이면 정하지 않는다', async () => {
    const withJibun = (zip: string, bjd: string, jibun: string) => ({
      ...hit(zip, bjd),
      jibunAddress: jibun,
    })
    const jibun = await runNormalize(
      { address: '서울 강남구 역삼동 737' },
      deps(
        searcher({
          '서울 강남구 역삼동 737': ok(
            withJibun('06236', '1168010100', '서울특별시 강남구 역삼동 737 강남파이낸스센터'),
            withJibun('06234', '1168010100', '서울특별시 강남구 역삼동 737-1'),
          ),
        }),
      ),
    )
    expect(jibun).toMatchObject({ grade: 'A', zipCode: '06236' })

    // 다른 시의 같은 도로명·번호 → 고르지 않고 후보로
    const twice = await runNormalize(
      { address: '중앙로 10' },
      deps(
        searcher({
          '중앙로 10': ok(
            hit('16613', '4111312900', '경기도 수원시 권선구 중앙로 10'),
            hit('06236', '1168010100', '서울특별시 강남구 중앙로 10'),
          ),
        }),
      ),
    )
    expect(twice.grade).not.toBe('A')
    expect(twice.candidates).toHaveLength(2)

    // 받은 후보가 전체가 아니면(다음 쪽이 있으면) 정하지 않는다
    const partial = await runNormalize(
      { address: '광주광역시 북구 용봉로 77' },
      deps(
        searcher({
          '광주광역시 북구 용봉로 77': {
            status: 'OK',
            total: 30,
            hits: [
              hit('61186', '1230010700', '전남광주통합특별시 북구 용봉로 77'),
              hit('61217', '1230010100'),
            ],
          },
        }),
      ),
    )
    expect(partial.grade).not.toBe('A')
  })

  it('④ 검색이 안 되면 글자 해석으로 법정동 C, ⑤ 시군구까지만 D', async () => {
    const s = searcher({})
    expect(
      await runNormalize({ address: '경기도 수원시 권선구 호매실동 999' }, deps(s)),
    ).toMatchObject({
      grade: 'C',
      bjdCode: '4111313600',
    })
    expect(await runNormalize({ address: '서울 강남구 없는길 1' }, deps(s))).toMatchObject({
      grade: 'D',
      method: 'TEXT_PARSE',
      sigunguCode: '11680',
      zipCode: null,
    })
  })

  it('⑤ 원본 5자리 우편번호가 지역 마스터에 있고 주소를 못 찾으면 D (우편번호만 확인)', async () => {
    const s = searcher({})
    expect(
      await runNormalize({ address: '어딘가 이상한 주소', zipCode: '06236' }, deps(s)),
    ).toMatchObject({
      grade: 'D',
      method: 'ZIP_ONLY',
      zipCode: '06236',
      sigunguCode: '11680',
    })
    // 글자 해석 시군구와 어긋나면 우편번호를 믿지 않는다
    expect(
      await runNormalize({ address: '서울 강남구 없는길 1', zipCode: '16613' }, deps(s)),
    ).toMatchObject({
      grade: 'D',
      method: 'TEXT_PARSE',
      zipCode: null,
    })
  })

  it('원본 우편번호가 정제 결과와 다르면 정제 결과를 쓰고 불일치 표시', async () => {
    const r = await runNormalize(
      { address: '서울 강남구 테헤란로 152', zipCode: '06237' },
      deps(searcher({ '서울 강남구 테헤란로 152': ok(GANGNAM) })),
    )
    expect(r).toMatchObject({ grade: 'A', zipCode: '06236', zipMismatch: true })
  })

  it('API를 못 쓰면 이유를 남기고 글자 해석으로 넘어간다', async () => {
    const s: AddressSearcher = vi.fn(async () => ({
      status: 'UNAVAILABLE' as const,
      reason: '키 없음',
    }))
    const r = await runNormalize({ address: '서울 강남구 역삼동 737' }, deps(s))
    expect(r).toMatchObject({ grade: 'C', bjdCode: '1168010100', apiUnavailable: '키 없음' })
    expect(s).toHaveBeenCalledTimes(1)
  })

  it('⑥ 아무것도 확인하지 못하면 F (6자리 구우편번호만 있는 경우 포함 — 대조표는 2차)', async () => {
    const s = searcher({})
    expect(await runNormalize({ address: '어딘가 이상한 주소' }, deps(s))).toMatchObject({
      grade: 'F',
    })
    expect(await runNormalize({ address: '', zipCode: '135-080' }, deps(s))).toMatchObject({
      grade: 'F',
    })
  })
})
