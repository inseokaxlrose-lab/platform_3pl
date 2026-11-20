import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getPartnerRoute } from '@/app/api/v1/partners/[partnerCd]/route'
import {
  GET as getShipTosRoute,
  POST as postShipTosRoute,
} from '@/app/api/v1/partners/[partnerCd]/ship-tos/route'
import { GET as listRoute, POST as postRoute } from '@/app/api/v1/partners/route'
import { runInContext } from '@/lib/actor'
import { flushApiTasks } from '@/lib/api/api-route'
import { issueApiKey } from '@/lib/api/api-keys'
import { prisma } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'

// 거래처 API (docs/decisions/0082 ③): upsert(보낸 칸만)·건별 결과·납품처 결과·정책·dry-run·조회

// 주소 검색 API 대신 가짜 검색기: 아는 주소 두 곳만 1건으로 찾고, 나머지는 0건
vi.mock('@/lib/regions/juso-client', () => {
  const KNOWN = [
    {
      key: '판교역로 166',
      hit: {
        roadAddress: '경기도 성남시 분당구 판교역로 166',
        jibunAddress: '경기도 성남시 분당구 백현동 532',
        zipCode: '13529',
        bjdCode: '4113510900',
        bdMgtSn: '4113510900105320000000001',
        buildingName: '',
      },
    },
    {
      key: '테헤란로 152',
      hit: {
        roadAddress: '서울특별시 강남구 테헤란로 152',
        jibunAddress: '서울특별시 강남구 역삼동 737',
        zipCode: '06236',
        bjdCode: '1168010100',
        bdMgtSn: '1168010100107370000000001',
        buildingName: '',
      },
    },
  ]
  return {
    jusoSearcher: () => async (keyword: string) => {
      const found = KNOWN.find((k) => keyword.includes(k.key))
      return found
        ? { status: 'OK', total: 1, hits: [found.hit] }
        : { status: 'OK', total: 0, hits: [] }
    },
  }
})

const asOperator = <T>(fn: () => Promise<T>) =>
  runInContext({ actor: 'admin.test', operatorId: TEST_OPERATOR_ID }, fn)

let shipperId = 0n
let icn = 0n
let gmh = 0n
let liveKey = ''

const issue = (env: 'LIVE' | 'TEST') =>
  asOperator(() =>
    issueApiKey({
      shipperId,
      env,
      name: `${env} 키`,
      scopes: ['PARTNER_READ', 'PARTNER_WRITE'],
      ips: [],
      expiresOn: null,
      rateLimitPerMin: 600,
    }),
  )

type Route = (r: Request, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>

async function call(
  route: Route,
  init: {
    method?: string
    body?: unknown
    path?: string
    params?: Record<string, string>
    key?: string
  } = {},
) {
  const response = await route(
    new Request(`http://localhost/api/v1${init.path ?? '/partners'}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'X-API-Key': init.key ?? liveKey, 'Content-Type': 'application/json' },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    }),
    { params: Promise.resolve(init.params ?? {}) },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, body: (await response.json()) as any }
}
const post = (body: unknown, key?: string) => call(postRoute, { body, key })

// 권역설정 배정 (우편번호 → 센터)
async function assignZip(zipCode: string, centerId: bigint) {
  await prisma.regionZip.upsert({
    where: { code: zipCode },
    create: {
      code: zipCode,
      sidoCode: zipCode.slice(0, 2),
      sigunguCode: '00000',
      firstLoadVer: 'T',
      lastLoadVer: 'T',
    },
    update: {},
  })
  const batch = await prisma.regionChangeBatch.create({
    data: { operatorId: TEST_OPERATOR_ID, changeType: 'GRID_ASSIGN', scopeDesc: '테스트' },
  })
  await prisma.regionCenterMap.create({
    data: { operatorId: TEST_OPERATOR_ID, zipCode, centerId, lastBatchId: batch.id },
  })
}

const GANGNAM = { zipCd: '06236', addr1: '서울 강남구 테헤란로 152' }
const partner = (overrides: Record<string, unknown> = {}) => ({
  partnerCd: 'P10023',
  partnerNm: '행복마트 강남점',
  telNo: '02-555-1234',
  ...GANGNAM,
  addr2: '1층',
  ...overrides,
})

beforeEach(async () => {
  await resetDatabase()
  icn = (await createTestCenter('ICN', { name: '이천센터' })).id
  gmh = (await createTestCenter('GMH', { name: '김해센터' })).id
  shipperId = (await createTestShipper('GANA')).id
  await prisma.shipper.update({
    where: { id: shipperId },
    data: { apiEnabledYn: 'Y', centers: { create: [{ centerId: icn, isDefault: 'Y' }] } },
  })
  await assignZip('06236', icn)
  liveKey = (await issue('LIVE')).fullKey
})

afterAll(async () => {
  await flushApiTasks()
  await prisma.$disconnect()
})

describe('POST /partners', () => {
  it('새 거래처 + 납품처: CREATED, 납품처 결과에 정제·배송센터. 같은 요청을 다시 보내면 UNCHANGED', async () => {
    const body = [
      partner({
        shipTos: [
          {
            shipToCd: 'p10023-back',
            shipToNm: '후문',
            default: true,
            ...GANGNAM,
            receiverNm: '김납품',
            centerCd: null,
          },
        ],
      }),
    ]
    const first = await post(body)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      result: 'SUCCESS',
      items: [
        {
          seq: 1,
          docNo: 'P10023',
          result: 'CREATED',
          shipTos: [
            {
              shipToCd: 'P10023-BACK',
              result: 'CREATED',
              addrGrade: 'A',
              zipCd: '06236',
              centerCd: 'ICN',
              centerAssignType: 'AUTO',
              centerAssignStatus: 'ASSIGNED',
              regionMismatch: false,
            },
          ],
        },
      ],
    })
    const saved = await prisma.customer.findFirstOrThrow({ where: { code: 'P10023' } })
    expect(saved).toMatchObject({
      phone: '025551234',
      source: 'API',
      lastRequestId: first.body.requestId,
    })

    const again = await post(body)
    expect(again.body.items[0]).toMatchObject({
      result: 'UNCHANGED',
      shipTos: [{ shipToCd: 'P10023-BACK', result: 'UNCHANGED' }],
    })
    expect((await prisma.customer.findFirstOrThrow({ where: { code: 'P10023' } })).rowVersion).toBe(
      saved.rowVersion,
    )
    // 요청 로그: 건별 결과
    await flushApiTasks()
    const log = await prisma.apiRequestLog.findUniqueOrThrow({
      where: { requestId: first.body.requestId },
      include: { items: true },
    })
    expect(log).toMatchObject({ apiCode: 'PARTNER_UPSERT', result: 'SUCCESS' })
  })

  it('보낸 칸만 고친다: 안 보낸 칸은 그대로, null은 지우기. 필수 칸을 null로 지우면 그 건만 VALIDATION_FAILED', async () => {
    await post([partner({ ceoNm: '홍대표' })])
    const updated = await post([{ partnerCd: 'P10023', telNo: '031-111-2222', ceoNm: null }])
    expect(updated.body.items[0].result).toBe('UPDATED')
    expect(await prisma.customer.findFirstOrThrow({ where: { code: 'P10023' } })).toMatchObject({
      name: '행복마트 강남점',
      phone: '0311112222',
      ceoName: null,
    })
    const bad = await post([{ partnerCd: 'P10023', partnerNm: null }, partner({ partnerCd: 'P2' })])
    expect(bad.body).toMatchObject({
      result: 'PARTIAL',
      summary: { total: 2, success: 1, fail: 1 },
      items: [
        { seq: 1, result: 'FAIL', errors: [{ code: 'VALIDATION_FAILED', field: 'partnerNm' }] },
        { seq: 2, result: 'CREATED' },
      ],
    })
  })

  it('납품처 없이: 주소가 있으면 기본 납품처 자동, 없으면 PARTNER_ADDRESS_REQUIRED. 코드 형식 오류는 PARTNER_CD_INVALID', async () => {
    const res = await post([
      partner(),
      { partnerCd: 'NOADDR', partnerNm: '주소 없음' },
      { partnerCd: '한글코드', partnerNm: '코드 오류', ...GANGNAM },
    ])
    expect(res.body.items).toMatchObject([
      {
        result: 'CREATED',
        shipTos: [{ shipToCd: 'P10023-01', result: 'CREATED', centerCd: 'ICN' }],
      },
      { result: 'FAIL', errors: [{ code: 'PARTNER_ADDRESS_REQUIRED' }] },
      { result: 'FAIL', errors: [{ code: 'PARTNER_CD_INVALID', field: 'partnerCd' }] },
    ])
  })

  it('보낸 납품처만 고치고 나머지는 그대로. 기본을 옮기고, 마지막 사용 중 납품처는 사용 중지 불가', async () => {
    await post([
      partner({ shipTos: [{ shipToCd: 'S1', shipToNm: '1호', default: true, ...GANGNAM }] }),
    ])
    const added = await post([
      {
        partnerCd: 'P10023',
        shipTos: [{ shipToCd: 'S2', shipToNm: '2호', default: true, ...GANGNAM }],
      },
    ])
    expect(added.body.items[0]).toMatchObject({
      result: 'UPDATED',
      shipTos: [{ shipToCd: 'S2', result: 'CREATED' }],
    })
    const rows = await prisma.shipTo.findMany({ where: { delYn: 'N' }, orderBy: { code: 'asc' } })
    expect(rows.map((r) => [r.code, r.isDefault, r.status])).toEqual([
      ['S1', 'N', 'ACTIVE'],
      ['S2', 'Y', 'ACTIVE'],
    ])
    const inactive = await post([
      {
        partnerCd: 'P10023',
        shipTos: [
          { shipToCd: 'S1', status: 'INACTIVE' },
          { shipToCd: 'S2', status: 'INACTIVE' },
        ],
      },
    ])
    expect(inactive.body.items[0]).toMatchObject({
      result: 'FAIL',
      errors: [{ code: 'LAST_SHIP_TO_INACTIVE' }],
    })
  })

  it('화주 정책: REQUIRED는 centerCd 없는 납품처만 FAIL (새 거래처의 유일한 납품처면 거래처도 FAIL)', async () => {
    await post([
      partner({ shipTos: [{ shipToCd: 'S1', shipToNm: '1호', ...GANGNAM, centerCd: 'ICN' }] }),
    ])
    await prisma.shipper.update({
      where: { id: shipperId },
      data: { shipToCenterPolicy: 'REQUIRED' },
    })
    const res = await post([
      { partnerCd: 'P10023', shipTos: [{ shipToCd: 'S2', shipToNm: '2호', ...GANGNAM }] },
      partner({ partnerCd: 'NEW', shipTos: [{ shipToCd: 'N1', shipToNm: '신규', ...GANGNAM }] }),
    ])
    expect(res.body.items).toMatchObject([
      {
        result: 'UPDATED',
        shipTos: [{ shipToCd: 'S2', result: 'FAIL', errors: [{ code: 'CENTER_REQUIRED' }] }],
      },
      { result: 'FAIL', errors: [{ code: 'CENTER_REQUIRED' }] },
    ])
    expect(await prisma.customer.count({ where: { code: 'NEW' } })).toBe(0)
    expect(await prisma.shipTo.count({ where: { code: 'S2' } })).toBe(0)
  })

  it('이용 센터가 아닌 centerCd: 자동 보류(기본)는 확인 필요로 저장, 자동 반려는 FAIL', async () => {
    const hold = await post([
      partner({ shipTos: [{ shipToCd: 'S1', shipToNm: '1호', ...GANGNAM, centerCd: 'GMH' }] }),
    ])
    expect(hold.body.items[0].shipTos[0]).toMatchObject({
      result: 'CREATED',
      centerCd: null,
      centerAssignStatus: 'NEED_CONFIRM',
      confirmReason: 'NOT_CLIENT_CENTER',
    })
    await prisma.shipper.update({
      where: { id: shipperId },
      data: { shipToCenterPolicy: 'AUTO_REJECT' },
    })
    const reject = await post([
      {
        partnerCd: 'P10023',
        shipTos: [{ shipToCd: 'S2', shipToNm: '2호', ...GANGNAM, centerCd: 'GMH' }],
      },
    ])
    expect(reject.body.items[0].shipTos[0]).toMatchObject({
      result: 'FAIL',
      errors: [{ code: 'NOT_CLIENT_CENTER' }],
    })
    void gmh
  })

  it('TEST 키는 결과만 계산하고 저장하지 않는다', async () => {
    const testKey = (await issue('TEST')).fullKey
    const res = await post([partner()], testKey)
    expect(res.body).toMatchObject({ dryRun: true, items: [{ result: 'CREATED' }] })
    expect(await prisma.customer.count()).toBe(0)
  })
})

describe('조회 · 납품처 API', () => {
  it('목록은 cursor로 이어 받고, 상세는 납품처 포함, 없는 거래처는 404', async () => {
    await post([partner({ partnerCd: 'A1' }), partner({ partnerCd: 'A2' })])
    const first = await call(listRoute, { path: '/partners?limit=1' })
    expect(first.body.data).toMatchObject({ items: [{ partnerCd: 'A1', shipToCount: 1 }] })
    const next = await call(listRoute, {
      path: `/partners?limit=1&cursor=${first.body.data.nextCursor}`,
    })
    expect(next.body.data).toMatchObject({ items: [{ partnerCd: 'A2' }], nextCursor: null })

    const detail = await call(getPartnerRoute, {
      path: '/partners/a1',
      params: { partnerCd: 'a1' },
    })
    expect(detail.body.data).toMatchObject({
      partnerCd: 'A1',
      telNo: '025551234',
      shipTos: [
        { shipToCd: 'A1-01', default: true, centerCd: 'ICN', centerAssignStatus: 'ASSIGNED' },
      ],
    })
    const missing = await call(getPartnerRoute, { path: '/partners/X', params: { partnerCd: 'X' } })
    expect(missing).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } })
  })

  it('POST /partners/{partnerCd}/ship-tos: 건 하나 = 납품처 하나, GET으로 목록', async () => {
    await post([partner()])
    const res = await call(postShipTosRoute, {
      path: '/partners/P10023/ship-tos',
      params: { partnerCd: 'P10023' },
      body: [
        { shipToCd: 'B1', shipToNm: '물류창고', ...GANGNAM },
        { shipToCd: 'B2', shipToNm: '주소 없음' },
      ],
    })
    expect(res.body).toMatchObject({
      result: 'PARTIAL',
      items: [
        { seq: 1, docNo: 'B1', result: 'CREATED', centerCd: 'ICN', centerAssignStatus: 'ASSIGNED' },
        { seq: 2, result: 'FAIL', errors: [{ code: 'VALIDATION_FAILED' }] },
      ],
    })
    const list = await call(getShipTosRoute, {
      path: '/partners/P10023/ship-tos',
      params: { partnerCd: 'P10023' },
    })
    expect(list.body.data.items.map((s: { shipToCd: string }) => s.shipToCd)).toEqual([
      'P10023-01',
      'B1',
    ])
  })
})
