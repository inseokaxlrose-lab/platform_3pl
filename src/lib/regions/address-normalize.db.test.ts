import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { resetDatabase } from '@/test/reset-database'
import { normalizeAddress } from './address-normalize'
import type { AddressSearcher } from './juso-client'
import { loadRegionMaster } from './region-load'

// 주소 정제 캐시 (tb_address_norm_cache) — 샘플 지역 마스터 + 가짜 검색기

const FIXTURE = 'src/test/fixtures/region'
const load = (loadVer: string) =>
  loadRegionMaster(prisma, {
    loadVer,
    bjdFile: `${FIXTURE}/bjd-sample.csv`,
    addressFiles: [`${FIXTURE}/address-sample.txt`],
  })

const GANGNAM = {
  roadAddress: '서울특별시 강남구 테헤란로 152',
  jibunAddress: '서울특별시 강남구 역삼동 737',
  zipCode: '06236',
  bjdCode: '1168010100',
  bdMgtSn: '1168010100107370000000001',
  buildingName: '',
}
const found: AddressSearcher = async (keyword) =>
  keyword.includes('테헤란로')
    ? { status: 'OK', total: 1, hits: [GANGNAM] }
    : { status: 'OK', total: 0, hits: [] }

beforeEach(async () => {
  await resetDatabase()
  await prisma.addressNormCache.deleteMany()
  await load('202610')
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('주소 정제 캐시', () => {
  it('정제 결과를 저장하고, 같은 주소(띄어쓰기·상세만 다름)는 검색 없이 캐시에서 꺼낸다', async () => {
    const searcher = vi.fn(found)
    const first = await normalizeAddress(
      prisma,
      { address: '서울 강남구 테헤란로 152' },
      { searcher },
    )
    expect(first).toMatchObject({ grade: 'A', method: 'API_EXACT', zipCode: '06236' })

    const second = await normalizeAddress(
      prisma,
      { address: '서울  강남구 테헤란로152 12층' },
      { searcher },
    )
    expect(second).toMatchObject({
      grade: 'A',
      method: 'CACHE',
      sourceMethod: 'API_EXACT',
      zipCode: '06236',
      bjdCode: '1168010100',
      detailAddress: '12층',
    })
    expect(searcher).toHaveBeenCalledTimes(1)
    expect(await prisma.addressNormCache.findFirst()).toMatchObject({
      hitCount: 1,
      addrLoadVer: '202610',
      rawAddress: '서울 강남구 테헤란로 152',
    })
  })

  it('API를 못 쓴 결과는 캐시하지 않는다 (키를 넣으면 더 좋아질 수 있으므로)', async () => {
    const unavailable: AddressSearcher = async () => ({ status: 'UNAVAILABLE', reason: '키 없음' })
    const r = await normalizeAddress(
      prisma,
      { address: '서울 강남구 역삼동 737' },
      { searcher: unavailable },
    )
    expect(r).toMatchObject({ grade: 'C', apiUnavailable: '키 없음' })
    expect(await prisma.addressNormCache.count()).toBe(0)
  })

  it('C·D·F는 지역 마스터를 다시 적재하면 다시 정제하고, A·B는 계속 쓴다', async () => {
    const searcher = vi.fn(found)
    await normalizeAddress(prisma, { address: '서울 강남구 역삼동 737' }, { searcher }) // C
    await normalizeAddress(prisma, { address: '서울 강남구 테헤란로 152' }, { searcher }) // A
    // 두 주소 모두 정리 후 글자가 같아 ②단계 없이 한 번씩 검색
    expect(searcher).toHaveBeenCalledTimes(2)

    await load('202611')
    searcher.mockClear()
    expect(
      await normalizeAddress(prisma, { address: '서울 강남구 역삼동 737' }, { searcher }),
    ).toMatchObject({ grade: 'C', method: 'TEXT_PARSE' })
    expect(
      await normalizeAddress(prisma, { address: '서울 강남구 테헤란로 152' }, { searcher }),
    ).toMatchObject({ grade: 'A', method: 'CACHE' })
    expect(searcher).toHaveBeenCalledTimes(1)
    expect(
      (await prisma.addressNormCache.findMany({ orderBy: { grade: 'asc' } })).map((c) => [
        c.grade,
        c.addrLoadVer,
      ]),
    ).toEqual([
      ['A', '202610'],
      ['C', '202611'],
    ])
  })
})
