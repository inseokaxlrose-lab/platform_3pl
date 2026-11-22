import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import type { CustomerItemInput } from '@/lib/customer-items/customer-item-schema'
import { EMPTY_CUSTOMER_ITEM } from '@/lib/customer-items/customer-item-schema'
import type { UploadRow } from '@/lib/excel/upload'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestShipper, systemUnit, versionOf } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  commitCustomerItemUploadAction,
  createCustomerItemAction,
  deleteCustomerItemsAction,
  getCustomerItemOptionsAction,
  listCustomerItemsAction,
  restoreCustomerItemsAction,
  updateCustomerItemAction,
  validateCustomerItemUploadAction,
} from './actions'

// 거래처별 품목코드 (docs/decisions/0098)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }

function signIn(scope: DataScope = ALL, codes: PermissionCode[] = [...ALL_PERMISSION_CODES]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

// 준비: 가나(이천)·다라(김해) 화주사, 가나의 매출처 이마트·홈플러스·매입처 공급사, 품목 생수(EA·BOX)·컵(EA)
const f = {
  icn: 0n,
  gmh: 0n,
  gana: 0n,
  dara: 0n,
  emart: '',
  homeplus: '',
  vendor: '',
  daraStore: '',
  water: '',
  cup: '',
  daraItem: '',
  ea: 0n,
  box: 0n,
}

async function customer(shipperId: bigint, code: string, role = 'SALES') {
  const row = await prisma.customer.create({
    data: { operatorId: TEST_OPERATOR_ID, shipperId, code, name: `${code} 거래처`, role },
  })
  return String(row.id)
}

async function item(shipperId: bigint, code: string, custCode: string | null, withBox = false) {
  const row = await prisma.item.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      shipperId,
      code,
      custCode,
      name: `${code} 품목`,
      baseUnitId: f.ea,
      units: {
        create: [
          { unitId: f.ea, level: 'BASE', convQty: 1 },
          ...(withBox ? [{ unitId: f.box, level: 'BOX', convQty: 24, sortOrder: 1 }] : []),
        ],
      },
    },
  })
  return String(row.id)
}

const input = (overrides: Partial<CustomerItemInput> = {}): CustomerItemInput => ({
  ...EMPTY_CUSTOMER_ITEM,
  customerId: f.emart,
  itemId: f.water,
  custItemCode: 'E-1001',
  ...overrides,
})

async function create(overrides: Partial<CustomerItemInput> = {}) {
  const result = await createCustomerItemAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return String(result.data.id)
}

const list = async (filters: Record<string, string> = {}, search = '') => {
  const result = await listCustomerItemsAction({ ...createDataGridState(), search, filters })
  if (!result.ok) throw new Error(result.error.message)
  return result.data.rows
}

const upload = (rows: Record<string, string>[]): UploadRow[] =>
  rows.map((values, index) => ({ rowNo: index + 2, values }))

beforeEach(async () => {
  await resetDatabase()
  signIn()
  f.ea = (await systemUnit('EA')).id
  f.box = (await systemUnit('BOX')).id
  f.icn = (await createTestCenter('ICN')).id
  f.gmh = (await createTestCenter('GMH')).id
  f.gana = (await createTestShipper('GANA')).id
  f.dara = (await createTestShipper('DARA', { ifKeyType: 'CUST_CD' })).id
  await prisma.shipperCenter.create({ data: { shipperId: f.gana, centerId: f.icn } })
  await prisma.shipperCenter.create({ data: { shipperId: f.dara, centerId: f.gmh } })
  f.emart = await customer(f.gana, 'EMART')
  f.homeplus = await customer(f.gana, 'HOMEPLUS', 'BOTH')
  f.vendor = await customer(f.gana, 'VENDOR', 'PURCHASE')
  f.daraStore = await customer(f.dara, 'DSTORE')
  await prisma.customer.update({ where: { id: BigInt(f.daraStore) }, data: { custCode: 'C-01' } })
  f.water = await item(f.gana, 'WATER', null, true)
  f.cup = await item(f.gana, 'CUP', null)
  f.daraItem = await item(f.dara, 'TV', 'I-01')
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('거래처별 품목코드 (0098)', () => {
  it('등록·목록·수정: 같은 거래처의 같은 품목·같은 코드는 거부, 다른 거래처는 같은 코드 가능', async () => {
    const id = await create({ custBarcode: '8801234500017', deliveryUnitId: String(f.box) })
    expect(await createCustomerItemAction(input({ custItemCode: 'E-2000' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await createCustomerItemAction(input({ itemId: f.cup }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    await create({ customerId: f.homeplus })

    const rows = await list()
    expect(rows.map((r) => [r.customer, r.itemCode, r.custItemCode, r.deliveryUnit])).toEqual([
      ['EMART 거래처 (EMART)', 'WATER', 'E-1001', 'BOX'],
      ['HOMEPLUS 거래처 (HOMEPLUS)', 'WATER', 'E-1001', null],
    ])
    // 검색어: 거래처 바코드·거래처명
    expect((await list({}, '880123')).map((r) => r.id)).toEqual([id])
    expect((await list({}, 'HOMEPLUS')).length).toBe(1)

    expect(
      await updateCustomerItemAction({
        ...input({ custItemCode: 'E-1002', minShelfDays: 30, minShelfRatio: '70' }),
        id,
        rowVersion: await versionOf('customerItem', id),
      }),
    ).toMatchObject({ ok: true })
    const saved = await prisma.customerItem.findUniqueOrThrow({ where: { id: BigInt(id) } })
    expect([saved.custItemCode, saved.minShelfDays, saved.minShelfRatio?.toString()]).toEqual([
      'E-1002',
      30,
      '70',
    ])
  })

  it('거부: 매입처·다른 화주사 품목·품목의 단위가 아닌 납품 단위', async () => {
    expect(await createCustomerItemAction(input({ customerId: f.vendor }))).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('매입처') },
    })
    expect(await createCustomerItemAction(input({ itemId: f.daraItem }))).toMatchObject({
      ok: false,
      error: { message: '거래처와 같은 화주사의 품목을 골라 주세요.' },
    })
    expect(
      await createCustomerItemAction(input({ itemId: f.cup, deliveryUnitId: String(f.box) })),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('납품 단위') } })
  })

  it('데이터 범위: 센터 직원은 소속 센터를 이용하는 화주사 것만 보고 고친다', async () => {
    await create()
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect(await list()).toEqual([])
    expect(await createCustomerItemAction(input({ itemId: f.cup }))).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    const options = await getCustomerItemOptionsAction({ shipperId: String(f.gana) })
    expect(options).toMatchObject({ ok: true, data: { customers: [], items: [] } })
  })

  it('팝업 선택지: 매출처·둘 다 거래처와 품목(단위 포함)', async () => {
    const options = await getCustomerItemOptionsAction({ shipperId: String(f.gana) })
    expect(options.ok && options.data.customers.map((c) => c.code)).toEqual(['EMART', 'HOMEPLUS'])
    expect(
      options.ok && options.data.items.map((i) => [i.code, i.units.map((u) => u.code)]),
    ).toEqual([
      ['CUP', ['EA']],
      ['WATER', ['EA', 'BOX']],
    ])
  })

  it('삭제 → 되살리기, 그 사이 같은 품목을 다시 등록했으면 거부', async () => {
    const id = await create()
    await deleteCustomerItemsAction({ ids: [id] })
    expect(await list()).toEqual([])
    const again = await create({ custItemCode: 'E-9' })
    expect(await restoreCustomerItemsAction({ ids: [id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    await deleteCustomerItemsAction({ ids: [again] })
    expect(await restoreCustomerItemsAction({ ids: [id] })).toMatchObject({ ok: true })
  })

  it('엑셀: 연동 조회 키로 찾고, 있으면 넣은 칸만 고친다 · 오류가 있으면 등록하지 않는다', async () => {
    const id = await create({ custItemName: '이마트 생수', custBarcode: 'B-1' })
    const rows = upload([
      // 이미 있는 줄: 거래처 품목코드만 고침 (이름·바코드는 그대로)
      { shipperCode: 'GANA', customerCd: 'EMART', itemCd: 'WATER', custItemCode: 'E-5000' },
      // 새 줄: 납품 단위 BOX, 사용 중지
      {
        shipperCode: 'GANA',
        customerCd: 'HOMEPLUS',
        itemCd: 'WATER',
        custItemCode: 'H-1',
        deliveryUnit: 'box',
        useYn: 'N',
      },
      // 사용자 정의 코드로 찾는 화주사
      { shipperCode: 'DARA', customerCustCd: 'C-01', itemCustCd: 'I-01', custItemCode: 'D-1' },
    ])
    const preview = await validateCustomerItemUploadAction(rows)
    expect(preview).toMatchObject({
      ok: true,
      data: { errorCount: 0, summary: expect.stringContaining('신규 2 · 수정 1') },
    })
    expect(await commitCustomerItemUploadAction(rows)).toMatchObject({ ok: true })

    const saved = await prisma.customerItem.findUniqueOrThrow({ where: { id: BigInt(id) } })
    expect([saved.custItemCode, saved.custItemName, saved.custBarcode]).toEqual([
      'E-5000',
      '이마트 생수',
      'B-1',
    ])
    const homeplus = await prisma.customerItem.findFirstOrThrow({
      where: { customerId: BigInt(f.homeplus) },
      include: { deliveryUnit: true },
    })
    expect([homeplus.deliveryUnit?.code, homeplus.status]).toEqual(['BOX', 'INACTIVE'])

    const bad = upload([
      { shipperCode: 'GANA', customerCd: 'EMART', itemCd: 'NOPE', custItemCode: 'X' },
      { shipperCode: 'GANA', customerCd: 'EMART', itemCd: 'CUP', custItemCode: 'E-5000' },
      { shipperCode: 'DARA', customerCd: 'DSTORE', itemCd: 'TV', custItemCode: 'Y' },
    ])
    const badPreview = await validateCustomerItemUploadAction(bad)
    expect(badPreview.ok && badPreview.data.rows.map((r) => r.errors.length > 0)).toEqual([
      true,
      true,
      true,
    ])
    expect(await commitCustomerItemUploadAction(bad)).toMatchObject({ ok: false })
    expect(await prisma.customerItem.count()).toBe(3)
  })
})
