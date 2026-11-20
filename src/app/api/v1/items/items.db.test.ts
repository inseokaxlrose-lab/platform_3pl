import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as getItemRoute } from '@/app/api/v1/items/[itemCd]/route'
import { GET as listRoute, POST as postRoute } from '@/app/api/v1/items/route'
import { runInContext } from '@/lib/actor'
import { flushApiTasks } from '@/lib/api/api-route'
import { issueApiKey } from '@/lib/api/api-keys'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { saveExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createTestCenter, createTestShipper, systemUnit } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'

// 품목 API (docs/decisions/0083 ③): upsert(보낸 칸만)·건별 결과·계산값·경고·오류코드·dry-run·조회

const asOperator = <T>(fn: () => Promise<T>) =>
  runInContext({ actor: 'admin.test', operatorId: TEST_OPERATOR_ID }, fn)

let shipperId = 0n
let icn = 0n
let liveKey = ''

const issue = (
  env: 'LIVE' | 'TEST',
  scopes: ('ITEM_READ' | 'ITEM_WRITE' | 'CUSTOMER_READ')[] = ['ITEM_READ', 'ITEM_WRITE'],
) =>
  asOperator(() =>
    issueApiKey({
      shipperId,
      env,
      name: `${env} 키`,
      scopes,
      ips: [],
      expiresOn: null,
      rateLimitPerMin: 600,
    }),
  )

type Route = (r: Request, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>

async function call(
  route: Route,
  init: { body?: unknown; path?: string; params?: Record<string, string>; key?: string } = {},
) {
  const response = await route(
    new Request(`http://localhost/api/v1${init.path ?? '/items'}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: { 'X-API-Key': init.key ?? liveKey, 'Content-Type': 'application/json' },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    }),
    { params: Promise.resolve(init.params ?? {}) },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, body: (await response.json()) as any }
}
const post = (body: unknown, key?: string) => call(postRoute, { body, key })

const EAN = '8801234567893'
const ITF = '18801234567890'

// 정의서 요청 예시 모양 (체크디지트가 맞는 바코드로)
const ramen = (overrides: Record<string, unknown> = {}) => ({
  itemCd: 'A10001',
  itemNm: '진라면 매운맛 120g',
  spec: '120g×40입',
  itemType: 'PRODUCT',
  category1: '면류',
  baseUom: 'EA',
  uoms: [
    {
      uom: 'BOX',
      level: 'BOX',
      qtyInBase: 40,
      widthCm: 52.0,
      depthCm: 36.0,
      heightCm: 28.0,
      grossWeightKg: 5.4,
    },
  ],
  pallet: { type: 'T11', ti: 8, hi: 6 },
  tempZone: 'AMBIENT',
  expiryMgmt: true,
  expiryType: 'CONSUME',
  expiryInput: 'EXPIRY',
  shelfLifeDays: 240,
  lotMgmt: true,
  lotSource: 'INPUT',
  barcodes: [
    { uom: 'EA', barcode: EAN, type: 'EAN13', primary: true },
    { uom: 'BOX', barcode: ITF, type: 'ITF14', primary: true },
  ],
  ...overrides,
})

const saved = (code = 'A10001') =>
  prisma.item.findFirstOrThrow({
    where: { shipperId, code },
    include: {
      units: { orderBy: { sortOrder: 'asc' }, include: { unit: { select: { code: true } } } },
      barcodes: { orderBy: { id: 'asc' }, include: { unit: { select: { code: true } } } },
    },
  })

beforeEach(async () => {
  await resetDatabase()
  icn = (await createTestCenter('ICN', { name: '이천센터' })).id
  shipperId = (await createTestShipper('GANA')).id
  await prisma.shipper.update({
    where: { id: shipperId },
    data: { apiEnabledYn: 'Y', centers: { create: [{ centerId: icn, isDefault: 'Y' }] } },
  })
  liveKey = (await issue('LIVE')).fullKey
})

afterAll(async () => {
  await flushApiTasks()
  await prisma.$disconnect()
})

describe('POST /items', () => {
  it('새 품목: CREATED + 계산값(BOX CBM·PLT 수량·높이·중량)·경고, 같은 요청을 다시 보내면 UNCHANGED', async () => {
    const res = await post([ramen()])
    expect(res.status).toBe(200)
    // PLT: 8 × 6 = 48 BOX × 40 = 1,920 EA, 높이 6 × 28 + 15 = 183cm (권장 180 초과), 중량 48 × 5.4 + 25 = 284.2kg
    expect(res.body.items[0]).toMatchObject({
      seq: 1,
      docNo: 'A10001',
      result: 'CREATED',
      volumeStatus: 'OK',
      box: { qtyInBase: 40, cbm: 0.052416, grossWeightKg: 5.4 },
      plt: { qtyInBase: 1920, boxQty: 48, heightCm: 183, grossWeightKg: 284.2, calculated: true },
      warnings: [{ code: 'PALLET_HEIGHT_EXCEEDED' }],
    })
    const item = await saved()
    expect(item).toMatchObject({ source: 'API', useLot: 'Y', expiryType: 'CONSUME' })
    expect(item.lastRequestId).toBe(res.body.requestId)
    expect(item.barcodes.map((b) => [b.unit.code, b.barcode, b.barcodeType, b.isPrimary])).toEqual([
      ['EA', EAN, 'EAN13', 'Y'],
      ['BOX', ITF, 'ITF14', 'Y'],
    ])

    const again = await post([ramen()])
    expect(again.body.items[0]).toMatchObject({ result: 'UNCHANGED', warnings: [] })
  })

  it('부분 수정: 보낸 칸만 고치고, null은 지우고, uoms·barcodes는 보낸 행만 (delete로 지움)', async () => {
    await post([ramen()])
    const res = await post([
      {
        itemCd: 'a10001',
        itemNm: '진라면 매운맛 120g (리뉴얼)',
        spec: null,
        uoms: [{ uom: 'CS', level: 'INNER', qtyInBase: 10 }],
        barcodes: [{ uom: 'BOX', barcode: ITF, delete: true }],
      },
    ])
    // 운영사 추가 단위가 없으면 CS는 없는 단위
    expect(res.body.items[0]).toMatchObject({
      result: 'FAIL',
      errors: [{ code: 'UOM_NOT_FOUND' }],
    })
    const ok = await post([
      {
        itemCd: 'a10001',
        itemNm: '진라면 매운맛 120g (리뉴얼)',
        spec: null,
        barcodes: [{ uom: 'BOX', barcode: ITF, delete: true }],
      },
    ])
    expect(ok.body.items[0]).toMatchObject({ result: 'UPDATED' })
    const item = await saved()
    expect(item).toMatchObject({
      name: '진라면 매운맛 120g (리뉴얼)',
      spec: null,
      category1: '면류',
    })
    expect(item.units.map((u) => u.level)).toEqual(['BASE', 'BOX', 'PLT'])
    expect(item.barcodes.map((b) => b.barcode)).toEqual([EAN])
  })

  it('화주 단위 코드는 외부코드 매핑(대상 단위)으로 바꾼다', async () => {
    const box = await systemUnit('BOX')
    await asOperator(() => saveExternalCodes(prisma, 'UNIT', box.id, { SAP: 'CT' }))
    const res = await post([
      ramen({
        uoms: [{ uom: 'ct', level: 'BOX', qtyInBase: 40 }],
        pallet: null,
        barcodes: [{ uom: 'CT', barcode: ITF }],
      }),
    ])
    expect(res.body.items[0]).toMatchObject({
      result: 'CREATED',
      volumeStatus: 'MISSING',
      plt: null,
    })
    expect((await saved()).barcodes.map((b) => [b.unit.code, b.barcodeType])).toEqual([
      ['BOX', 'ITF14'],
    ])
  })

  it('새 품목에서 expiryMgmt·lotMgmt를 안 보내면 화주 설정을 따른다', async () => {
    await prisma.shipper.update({ where: { id: shipperId }, data: { useLot: 'Y', useExpiry: 'N' } })
    const res = await post([{ itemCd: 'PLAIN', itemNm: '낱개', baseUom: 'EA' }])
    expect(res.body.items[0]).toMatchObject({
      result: 'CREATED',
      warnings: [{ code: 'VOLUME_MISSING' }],
    })
    expect(await saved('PLAIN')).toMatchObject({ useLot: 'Y', lotSource: 'INPUT', useExpiry: 'N' })
  })

  it('건별 오류코드: 한 건이 실패해도 나머지는 처리한다', async () => {
    await post([
      {
        itemCd: 'OTHER',
        itemNm: '다른 품목',
        baseUom: 'EA',
        barcodes: [{ uom: 'EA', barcode: EAN }],
      },
    ])
    const res = await post([
      { itemCd: 'BAD CODE', itemNm: 'x', baseUom: 'EA' },
      ramen({ itemCd: 'E1', expiryType: null }),
      ramen({ itemCd: 'E2', expiryInput: 'MFG', shelfLifeDays: null }),
      ramen({ itemCd: 'E3', lotSource: null }),
      ramen({
        itemCd: 'E4',
        uoms: [{ uom: 'BOX', level: 'BOX', qtyInBase: 0.5 }],
        pallet: null,
        barcodes: [],
      }),
      ramen({ itemCd: 'E5', barcodes: [{ uom: 'EA', barcode: '8801234567890' }] }),
      ramen({ itemCd: 'E6', barcodes: [{ uom: 'EA', barcode: EAN }] }),
      ramen({ itemCd: 'E7', baseUom: 'BOX', uoms: [], pallet: null, barcodes: [] }),
      ramen({ itemCd: 'E8', pallet: { type: 'X99', ti: 1, hi: 1 } }),
      { itemCd: 'OK1', itemNm: '정상', baseUom: 'EA' },
    ])
    expect(res.status).toBe(200)
    expect(
      res.body.items.map((i: { result: string; errors?: { code: string; field?: string }[] }) => [
        i.result,
        i.errors?.[0]?.code ?? null,
        i.errors?.[0]?.field ?? null,
      ]),
    ).toEqual([
      ['FAIL', 'ITEM_CD_INVALID', 'itemCd'],
      ['FAIL', 'EXPIRY_INFO_REQUIRED', 'expiryType'],
      ['FAIL', 'SHELF_LIFE_REQUIRED', 'shelfLifeDays'],
      ['FAIL', 'LOT_SOURCE_REQUIRED', 'lotSource'],
      ['FAIL', 'UOM_QTY_INVALID', null],
      ['FAIL', 'BARCODE_CHECKDIGIT', null],
      ['FAIL', 'BARCODE_DUPLICATE', null],
      ['FAIL', 'BASE_UOM_INVALID', null],
      ['FAIL', 'PALLET_TYPE_NOT_FOUND', null],
      ['CREATED', null, null],
    ])
  })

  it('재고가 있으면 LOT·기한 관리 여부·기본단위를 바꿀 수 없다 (ITEM_STOCK_EXISTS), 다른 칸은 된다', async () => {
    await post([{ itemCd: 'STOCKED', itemNm: '재고 품목', baseUom: 'EA' }])
    const item = await saved('STOCKED')
    const inbound = await ensureCenterDefaults(prisma, icn)
    const location = await prisma.location.findFirstOrThrow({ where: { warehouseId: inbound!.id } })
    await asOperator(() =>
      stockTransaction((tx) =>
        receiveStock(tx, { address: { locationId: location.id, itemId: item.id }, qty: '5' }),
      ),
    )
    const res = await post([
      { itemCd: 'STOCKED', lotMgmt: true, lotSource: 'INPUT' },
      { itemCd: 'STOCKED', itemNm: '재고 품목 2' },
    ])
    expect(
      res.body.items.map((i: { result: string; errors?: { code: string }[] }) => [
        i.result,
        i.errors?.[0]?.code ?? null,
      ]),
    ).toEqual([
      ['FAIL', 'ITEM_STOCK_EXISTS'],
      ['UPDATED', null],
    ])
  })

  it('TEST 키는 결과만 계산하고 저장하지 않는다, 쓰기 권한이 없는 키는 403', async () => {
    const testKey = (await issue('TEST')).fullKey
    const res = await post([ramen()], testKey)
    expect(res.body).toMatchObject({
      dryRun: true,
      items: [{ result: 'CREATED', plt: { qtyInBase: 1920 } }],
    })
    expect(await prisma.item.count()).toBe(0)

    const readOnly = (await issue('LIVE', ['ITEM_READ'])).fullKey
    expect(await post([ramen()], readOnly)).toMatchObject({
      status: 403,
      body: { error: { code: 'SCOPE_REQUIRED' } },
    })
  })
})

describe('조회 키 (0084)', () => {
  it('CODE 화주: itemCd로 찾고, itemCustCd는 보통 칸으로 저장한다', async () => {
    const res = await post([ramen({ itemCustCd: 'ERP-1' })])
    expect(res.body.items[0]).toMatchObject({
      docNo: 'A10001',
      result: 'CREATED',
      itemCd: 'A10001',
      itemCustCd: 'ERP-1',
    })
    // itemCd가 없으면 건별 오류
    const missing = await post([{ itemNm: '코드 없음', baseUom: 'EA' }])
    expect(missing.body.items[0]).toMatchObject({
      result: 'FAIL',
      errors: [{ code: 'ITEM_CD_INVALID', field: 'itemCd' }],
    })
  })

  it('CUST_CD 화주: itemCustCd로 찾고, 새 품목의 품목코드는 자동 체번, 상세 경로도 itemCustCd', async () => {
    await prisma.shipper.update({ where: { id: shipperId }, data: { ifKeyType: 'CUST_CD' } })
    const { codePrefix } = await prisma.shipper.findUniqueOrThrow({ where: { id: shipperId } })
    const res = await post([{ itemCustCd: 'erp-1', itemNm: '화주 품목', baseUom: 'EA' }])
    expect(res.body.items[0]).toMatchObject({
      docNo: 'erp-1',
      result: 'CREATED',
      itemCd: `${codePrefix}S000001`,
      itemCustCd: 'erp-1',
    })
    // 같은 키로 다시 보내면 그 품목을 고친다
    const again = await post([{ itemCustCd: 'erp-1', itemNm: '이름 바꿈' }])
    expect(again.body.items[0]).toMatchObject({ result: 'UPDATED', itemCd: `${codePrefix}S000001` })
    expect(await prisma.item.count({ where: { shipperId } })).toBe(1)
    // 품목코드는 바꿀 수 없다
    const changed = await post([{ itemCustCd: 'erp-1', itemCd: 'OTHER' }])
    expect(changed.body.items[0]).toMatchObject({
      result: 'FAIL',
      errors: [{ code: 'ITEM_CD_INVALID' }],
    })
    // itemCustCd가 없으면 건별 오류
    const missing = await post([{ itemCd: 'A1', itemNm: '키 없음', baseUom: 'EA' }])
    expect(missing.body.items[0]).toMatchObject({ errors: [{ field: 'itemCustCd' }] })

    const detail = await call(getItemRoute, { path: '/items/erp-1', params: { itemCd: 'erp-1' } })
    expect(detail.body.data).toMatchObject({ itemCustCd: 'erp-1', itemNm: '이름 바꿈' })
  })
})

describe('GET /items', () => {
  it('목록은 cursor로 이어 받고, 상세는 단위·바코드·계산값 포함, 없는 품목은 404', async () => {
    await post([ramen({ itemCd: 'A1' }), { itemCd: 'A2', itemNm: '두 번째', baseUom: 'EA' }])
    const first = await call(listRoute, { path: '/items?limit=1' })
    expect(first.body.data).toMatchObject({ items: [{ itemCd: 'A1' }] })
    const second = await call(listRoute, {
      path: `/items?limit=1&cursor=${first.body.data.nextCursor}`,
    })
    expect(second.body.data).toMatchObject({
      items: [{ itemCd: 'A2', volumeStatus: 'MISSING' }],
      nextCursor: null,
    })

    const detail = await call(getItemRoute, { path: '/items/a1', params: { itemCd: 'a1' } })
    expect(detail.body.data).toMatchObject({
      itemCd: 'A1',
      baseUom: 'EA',
      uoms: [
        { uom: 'BOX', level: 'BOX', qtyInBase: 40, calculated: false },
        { uom: 'PLT', level: 'PLT', qtyInBase: 1920, heightCm: 183, calculated: true },
      ],
      pallet: { type: 'T11', ti: 8, hi: 6, boxQty: 48 },
      expiryMgmt: true,
      lotMgmt: true,
      status: 'ACTIVE',
      plt: { qtyInBase: 1920 },
      barcodes: [
        { uom: 'EA', barcode: EAN, type: 'EAN13', primary: true },
        { uom: 'BOX', barcode: ITF, type: 'ITF14', primary: true },
      ],
    })
    const missing = await call(getItemRoute, { path: '/items/NOPE', params: { itemCd: 'NOPE' } })
    expect(missing).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } })
  })
})
