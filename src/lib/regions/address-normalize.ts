import 'server-only'
import type { Db } from '@/lib/prisma'
import { addressCacheKey, cleanAddress, cleanZip, squash } from './address-clean'
import { buildBjdIndex, parseAddressText, type BjdIndex } from './address-text-parse'
import { jusoSearcher, type AddressHit, type AddressSearcher } from './juso-client'
import type { AddrGrade, ADDR_NORM_METHOD } from './region-codes'

// 주소 정제 공통 모듈 (docs/address-normalization.md, 0076)
// 입력 주소 → 5자리 우편번호·법정동코드 + 신뢰 등급(A~F). 원본은 바꾸지 않고 결과만 돌려준다
//   ① 원본으로 검색 1건 → A  ② 정리 후 검색 1건 → A  ③ 여러 건이 모두 같은 우편번호 → B
//   ④ 글자 해석으로 법정동 확정 → C  ⑤ 시군구까지만 → D (원본 5자리 우편번호만 맞으면 D, 사용자 결정)  ⑥ 실패 → F

export type AddressInput = {
  address: string
  zipCode?: string | null // 원본 우편번호 (5자리·6자리·없음)
  detail?: string | null // 상세주소가 따로 들어오면
}

export type NormMethod = (typeof ADDR_NORM_METHOD.values)[number]

export type NormResult = {
  grade: AddrGrade
  method: NormMethod
  // 캐시에서 꺼낸 경우 처음 정제한 방법 (method는 'CACHE')
  sourceMethod: NormMethod
  zipCode: string | null
  bjdCode: string | null
  sigunguCode: string | null // 구가 있는 시만 확인되면 시 코드 (예: 수원시 41110)
  sidoCode: string | null
  roadAddress: string | null
  jibunAddress: string | null
  detailAddress: string | null
  bdMgtSn: string | null
  latitude: number | null // 좌표는 1차에서 받지 않는다 (좌표 API 별도)
  longitude: number | null
  // 여러 건이 검색된 경우 화면에서 고를 후보 (최대 20)
  candidates: AddressHit[]
  // 원본 5자리 우편번호가 정제 결과와 다름 (정제 결과를 쓴다)
  zipMismatch: boolean
  // 주소 API를 쓰지 못한 이유 (키 없음·연결 실패). 이 결과는 캐시하지 않는다
  apiUnavailable: string | null
}

export type NormalizeDeps = {
  searcher: AddressSearcher
  index: BjdIndex
  // 지역 마스터에 있는(폐지 아닌) 우편번호면 그 시군구
  findZip: (zip: string) => Promise<{ sidoCode: string; sigunguCode: string } | null>
}

const empty = (input: AddressInput) => ({
  zipCode: null,
  bjdCode: null,
  sigunguCode: null,
  sidoCode: null,
  roadAddress: null,
  jibunAddress: null,
  detailAddress: cleanAddress(input.address, input.detail).detail,
  bdMgtSn: null,
  latitude: null,
  longitude: null,
  candidates: [] as AddressHit[],
  zipMismatch: false,
  apiUnavailable: null as string | null,
})

const fromHit = (hit: AddressHit) => ({
  zipCode: hit.zipCode,
  bjdCode: hit.bjdCode,
  sigunguCode: hit.bjdCode.slice(0, 5),
  sidoCode: hit.bjdCode.slice(0, 2),
  roadAddress: hit.roadAddress || null,
  jibunAddress: hit.jibunAddress || null,
  bdMgtSn: hit.bdMgtSn || null,
})

// 모두 같은 값이면 그 값, 아니면 null
const same = (values: string[]) =>
  values.length && values.every((v) => v === values[0]) ? values[0] : null

// 검색어 끝의 '도로명 + 건물번호'(용봉로 77) 또는 '동·리 + 번지'(역삼동 737, 이치리 산 12)
const ADDRESS_TAIL = /([가-힣A-Za-z0-9·]+(?:로|길|동|가|리))\s*((?:산\s*)?\d+(?:-\d+)?)$/

// 여러 건 중 검색어 끝과 '정확히' 같은 주소가 하나뿐이면 그 건
// API는 부분 일치도 함께 준다: '용봉로 77' → 용봉로 77 + 용봉로138번길 77
// 같은 이름이 두 곳 이상이면(다른 시의 중앙로 10) 정하지 않는다
export function exactHit(keyword: string, hits: AddressHit[]): AddressHit | null {
  const tail = ADDRESS_TAIL.exec(keyword.trim())
  if (!tail) return null
  const name = tail[1]
  const number = tail[2].replace(/\s+/g, ' ')
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 앞은 띄어쓰기·처음, 뒤는 띄어쓰기·끝 (지번 주소 뒤에는 건물명이 붙을 수 있다)
  const pattern = new RegExp(`(^|\\s)${escape(name)}\\s+${escape(number)}(\\s|$)`)
  const matched = hits.filter((h) => pattern.test(h.roadAddress) || pattern.test(h.jibunAddress))
  return matched.length === 1 ? matched[0] : null
}

export async function runNormalize(input: AddressInput, deps: NormalizeDeps): Promise<NormResult> {
  const base = empty(input)
  const { zip5 } = cleanZip(input.zipCode)
  const raw = squash(input.address)
  const { keyword } = cleanAddress(input.address, input.detail)
  const done = (r: Omit<NormResult, 'sourceMethod' | 'zipMismatch'>): NormResult => ({
    ...r,
    sourceMethod: r.method,
    zipMismatch: Boolean(zip5 && r.zipCode && r.zipCode !== zip5),
  })

  // ①·② 검색 (정리 후 글자가 같으면 ②는 건너뜀). 검색어가 2글자 미만이면 API를 부르지 않는다
  const searches: { method: 'API_EXACT' | 'API_CLEANED'; keyword: string }[] = [
    { method: 'API_EXACT', keyword: raw },
  ]
  if (keyword && keyword !== raw) searches.push({ method: 'API_CLEANED', keyword })
  let multi: AddressHit[] = []
  let multiComplete = false
  for (const search of searches) {
    if (search.keyword.length < 2) continue
    const result = await deps.searcher(search.keyword)
    if (result.status === 'UNAVAILABLE') {
      base.apiUnavailable = result.reason
      break
    }
    if (result.hits.length === 1 && result.total === 1) {
      return done({ ...base, ...fromHit(result.hits[0]), grade: 'A', method: search.method })
    }
    // 여러 건이라도 받은 후보가 전체이고, 검색어와 정확히 같은 주소가 하나뿐이면 A
    const complete = result.total <= result.hits.length
    const exact = complete && result.hits.length > 1 ? exactHit(search.keyword, result.hits) : null
    if (exact) return done({ ...base, ...fromHit(exact), grade: 'A', method: search.method })
    // 여러 건: 정리 후 검색 결과를 더 믿는다 (나중 것이 앞 것을 덮음)
    if (result.hits.length > 1) {
      multi = result.hits
      multiComplete = result.total <= result.hits.length
    }
  }
  base.candidates = multi

  // ③ 여러 건이 모두 같은 우편번호 (받은 후보가 전체일 때만 판단)
  const sameZip = multiComplete ? same(multi.map((h) => h.zipCode)) : null
  if (sameZip) {
    const bjd = same(multi.map((h) => h.bjdCode))
    const sigungu = same(multi.map((h) => h.bjdCode.slice(0, 5)))
    return done({
      ...base,
      zipCode: sameZip,
      bjdCode: bjd,
      sigunguCode: sigungu,
      sidoCode: sigungu?.slice(0, 2) ?? multi[0].bjdCode.slice(0, 2),
      grade: 'B',
      method: 'MULTI_SAME_ZIP',
    })
  }

  // ④ 글자 해석으로 법정동 (괄호 안 참고항목 '(역삼동, …)'도 단서라 원본 글자로)
  const parsed = parseAddressText(deps.index, raw)
  if (parsed.level === 'BJD') {
    return done({
      ...base,
      bjdCode: parsed.bjdCode,
      sigunguCode: parsed.sigunguCode,
      sidoCode: parsed.sidoCode,
      grade: 'C',
      method: 'TEXT_PARSE',
    })
  }

  // ⑤ 원본 5자리 우편번호가 지역 마스터에 있으면 D (글자 해석 시군구와 어긋나면 쓰지 않는다)
  const zipInfo = zip5 ? await deps.findZip(zip5) : null
  if (
    zip5 &&
    zipInfo &&
    (parsed.level === 'NONE' || parsed.sigunguCodes.includes(zipInfo.sigunguCode))
  ) {
    return done({ ...base, zipCode: zip5, ...zipInfo, grade: 'D', method: 'ZIP_ONLY' })
  }
  if (parsed.level === 'SIGUNGU') {
    return done({
      ...base,
      sigunguCode: parsed.sigunguCode,
      sidoCode: parsed.sidoCode,
      grade: 'D',
      method: 'TEXT_PARSE',
    })
  }

  // ⑥ 실패
  return done({ ...base, grade: 'F', method: 'TEXT_PARSE' })
}

// ── DB: 이름 사전(지역 마스터 적재가 바뀔 때만 다시 만든다) · 캐시 ──

let indexCache: { key: string; index: BjdIndex } | null = null

async function lastLoad(db: Db) {
  return db.regionLoadHist.findFirst({
    where: { status: 'DONE' },
    orderBy: { id: 'desc' },
    select: { id: true, loadVer: true },
  })
}

export async function getBjdIndex(db: Db) {
  const load = await lastLoad(db)
  const key = String(load?.id ?? 'none')
  if (indexCache?.key === key) return indexCache.index
  const rows = await db.regionBjd.findMany({
    where: { abolishedYn: 'N' },
    select: {
      code: true,
      sidoCode: true,
      sidoName: true,
      sigunguCode: true,
      sigunguName: true,
      emdName: true,
      riName: true,
      level: true,
    },
  })
  const index = buildBjdIndex(rows)
  indexCache = { key, index }
  return index
}

// A·B는 주소 기준 버전과 무관하게 재사용, C·D·F는 같은 버전일 때만 (갱신 후 다시 정제)
const reusable = (grade: string, cachedVer: string | null, currentVer: string | null) =>
  grade === 'A' || grade === 'B' || cachedVer === currentVer

export async function normalizeAddress(
  db: Db,
  input: AddressInput,
  options: { searcher?: AddressSearcher; useCache?: boolean } = {},
): Promise<NormResult> {
  const useCache = options.useCache ?? true
  const key = addressCacheKey(input.address, input.zipCode)
  const load = await lastLoad(db)
  const currentVer = load?.loadVer ?? null

  if (useCache) {
    const cached = await db.addressNormCache.findUnique({ where: { addrHash: key } })
    if (cached && reusable(cached.grade, cached.addrLoadVer, currentVer)) {
      await db.addressNormCache.update({
        where: { addrHash: key },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      const { zip5 } = cleanZip(input.zipCode)
      return {
        ...empty(input),
        grade: cached.grade as AddrGrade,
        method: 'CACHE',
        sourceMethod: cached.method as NormMethod,
        zipCode: cached.zipCode,
        bjdCode: cached.bjdCode,
        sigunguCode: cached.sigunguCode,
        sidoCode: cached.sidoCode,
        roadAddress: cached.roadAddress,
        jibunAddress: cached.jibunAddress,
        bdMgtSn: cached.bdMgtSn,
        zipMismatch: Boolean(zip5 && cached.zipCode && cached.zipCode !== zip5),
      }
    }
  }

  const result = await runNormalize(input, {
    searcher: options.searcher ?? jusoSearcher(),
    index: await getBjdIndex(db),
    findZip: async (zip) =>
      db.regionZip.findFirst({
        where: { code: zip, abolishedYn: 'N' },
        select: { sidoCode: true, sigunguCode: true },
      }),
  })

  // 캐시하지 않는 경우: API를 못 쓴 결과(나중에 더 좋아질 수 있음), 고를 후보가 남은 C·D·F
  const pickPending = result.candidates.length > 1 && result.grade !== 'A' && result.grade !== 'B'
  if (useCache && !result.apiUnavailable && !pickPending) {
    const data = {
      rawAddress: squash(input.address).slice(0, 500),
      grade: result.grade,
      method: result.sourceMethod,
      zipCode: result.zipCode,
      bjdCode: result.bjdCode,
      sigunguCode: result.sigunguCode,
      sidoCode: result.sidoCode,
      roadAddress: result.roadAddress?.slice(0, 300) ?? null,
      jibunAddress: result.jibunAddress?.slice(0, 300) ?? null,
      bdMgtSn: result.bdMgtSn,
      addrLoadVer: currentVer,
    }
    await db.addressNormCache.upsert({
      where: { addrHash: key },
      create: { addrHash: key, ...data },
      update: { ...data, hitCount: 0, lastHitAt: null },
    })
  }
  return result
}
