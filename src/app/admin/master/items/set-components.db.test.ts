import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import { getItemForEdit } from '@/lib/items/item-queries'
import type { ItemInput } from '@/lib/items/item-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestShipper, systemUnit, versionOf } from '@/test/factories'
import { itemInput, unitRow } from '@/test/item-input'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createItemAction,
  deleteItemsAction,
  listSetComponentOptionsAction,
  restoreItemsAction,
  updateItemAction,
} from './actions'

// 세트 구성품·세트 방식 (docs/decisions/0098)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }

let ea = 0n
let kg = 0n
let gana = 0n
let dara = 0n

type Overrides = Partial<ItemInput> & { shipperId?: bigint; code: string; unit?: bigint }

async function create({ shipperId, code, unit, ...overrides }: Overrides) {
  const baseUnit = unit ?? ea
  const result = await createItemAction({
    shipperId: String(shipperId ?? gana),
    code,
    ...itemInput(baseUnit, { units: [unitRow('BASE', baseUnit, '1')], ...overrides }),
  })
  return result
}
async function createOk(overrides: Overrides) {
  const result = await create(overrides)
  if (!result.ok) throw new Error(result.error.message)
  return result.data.id
}

async function update(id: string, overrides: Partial<ItemInput>) {
  return updateItemAction({
    ...itemInput(ea, { units: [unitRow('BASE', ea, '1')], ...overrides }),
    id,
    rowVersion: await versionOf('item', id),
  })
}

const componentsOf = async (id: string) =>
  (
    await prisma.itemSetComponent.findMany({
      where: { setItemId: BigInt(id) },
      orderBy: { sortOrder: 'asc' },
      select: { componentItem: { select: { code: true } }, qty: true },
    })
  ).map((c) => [c.componentItem.code, c.qty.toString()])

beforeEach(async () => {
  await resetDatabase()
  ea = (await systemUnit('EA')).id
  kg = (await systemUnit('KG')).id
  gana = (await createTestShipper('GANA')).id
  dara = (await createTestShipper('DARA')).id
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(ALL_PERMISSION_CODES))
  vi.mocked(getCurrentScope).mockResolvedValue(ALL)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('세트 구성품 (0098)', () => {
  it('세트를 구성품과 함께 등록하고, 수정 화면이 그대로 불러온다', async () => {
    const water = await createOk({ code: 'WATER' })
    const cup = await createOk({ code: 'CUP' })
    const sugar = await createOk({ code: 'SUGAR', unit: kg })

    const id = await createOk({
      code: 'GIFT',
      itemType: 'SET',
      components: [
        { itemId: water, qty: '2' },
        { itemId: sugar, qty: '0.5' },
        { itemId: cup, qty: '1' },
      ],
    })
    expect(await componentsOf(id)).toEqual([
      ['WATER', '2'],
      ['SUGAR', '0.5'],
      ['CUP', '1'],
    ])
    // 세트 방식을 보내지 않으면 가상 세트
    const saved = await prisma.item.findUniqueOrThrow({ where: { id: BigInt(id) } })
    expect([saved.setYn, saved.setType]).toEqual(['Y', 'VIRTUAL'])

    const edit = await getItemForEdit(BigInt(id), ALL)
    expect(edit?.input.setType).toBe('VIRTUAL')
    expect(edit?.input.components).toEqual([
      { itemId: water, qty: '2' },
      { itemId: sugar, qty: '0.5' },
      { itemId: cup, qty: '1' },
    ])
    // 세트가 아닌 품목은 구성품을 "보내지 않음"
    expect((await getItemForEdit(BigInt(water), ALL))?.input.components).toBeUndefined()
  })

  it('거부: 구성품 0개·같은 품목 두 번·다른 화주사 품목·세트 품목·자기 자신·소수 자리', async () => {
    const water = await createOk({ code: 'WATER' })
    const other = await createOk({ code: 'OTHER', shipperId: dara })
    const set1 = await createOk({
      code: 'SET1',
      itemType: 'SET',
      components: [{ itemId: water, qty: '1' }],
    })
    const asSet = (components: ItemInput['components']) =>
      create({ code: 'GIFT', itemType: 'SET', components })

    expect(await asSet([])).toMatchObject({
      ok: false,
      error: { fieldErrors: { components: ['세트 구성품을 1개 이상 넣어 주세요.'] } },
    })
    expect(
      await asSet([
        { itemId: water, qty: '1' },
        { itemId: water, qty: '2' },
      ]),
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: { 'components.1.itemId': expect.any(Array) } },
    })
    expect(await asSet([{ itemId: other, qty: '1' }])).toMatchObject({
      ok: false,
      error: { message: '구성품은 같은 화주사의 품목 중에서 골라 주세요.' },
    })
    expect(await asSet([{ itemId: set1, qty: '1' }])).toMatchObject({
      ok: false,
      error: { message: '세트 품목(SET1)은 다른 세트의 구성품으로 넣을 수 없습니다.' },
    })
    expect(await asSet([{ itemId: water, qty: '1.5' }])).toMatchObject({
      ok: false,
      error: { message: 'WATER 수량은 정수입니다. (기본단위 EA)' },
    })
    expect(
      await update(set1, { itemType: 'SET', components: [{ itemId: set1, qty: '1' }] }),
    ).toMatchObject({ ok: false, error: { message: '세트 자신을 구성품으로 넣을 수 없습니다.' } })
  })

  it('구성품을 보내지 않으면 그대로(엑셀·API), 세트가 아닌 유형으로 바꾸면 구성품·세트 방식을 지운다', async () => {
    const water = await createOk({ code: 'WATER' })
    const id = await createOk({
      code: 'GIFT',
      itemType: 'SET',
      setType: 'KIT',
      components: [{ itemId: water, qty: '3' }],
    })
    expect(await update(id, { itemType: 'SET', name: '선물세트' })).toMatchObject({ ok: true })
    expect(await componentsOf(id)).toEqual([['WATER', '3']])
    expect((await prisma.item.findUniqueOrThrow({ where: { id: BigInt(id) } })).setType).toBe('KIT')

    expect(await update(id, { itemType: 'GOODS', components: [] })).toMatchObject({ ok: true })
    expect(await componentsOf(id)).toEqual([])
    const saved = await prisma.item.findUniqueOrThrow({ where: { id: BigInt(id) } })
    expect([saved.setYn, saved.setType]).toEqual(['N', null])
  })

  it('구성품으로 쓰인 품목: 세트로 바꾸거나 지울 수 없다, 세트를 함께 지우면 된다', async () => {
    const water = await createOk({ code: 'WATER' })
    const gift = await createOk({
      code: 'GIFT',
      itemType: 'SET',
      components: [{ itemId: water, qty: '1' }],
    })
    expect(await update(water, { itemType: 'SET', components: [] })).toMatchObject({ ok: false })
    expect(
      await update(water, {
        itemType: 'SET',
        components: [{ itemId: gift, qty: '1' }],
      }),
    ).toMatchObject({ ok: false })
    expect(await deleteItemsAction({ ids: [water] })).toMatchObject({
      ok: false,
      error: { message: '품목 WATER은 세트(GIFT)의 구성품입니다. 세트에서 먼저 빼 주세요.' },
    })
    expect(await deleteItemsAction({ ids: [water, gift] })).toMatchObject({ ok: true })
  })

  it('세트를 되살릴 때 구성품이 지워져 있으면 거부', async () => {
    const water = await createOk({ code: 'WATER' })
    const gift = await createOk({
      code: 'GIFT',
      itemType: 'SET',
      components: [{ itemId: water, qty: '1' }],
    })
    await deleteItemsAction({ ids: [gift] })
    await deleteItemsAction({ ids: [water] })
    expect(await restoreItemsAction({ ids: [gift] })).toMatchObject({
      ok: false,
      error: {
        message: '세트(GIFT)의 구성품 WATER이 지워져 있습니다. 구성품을 먼저 되살려 주세요.',
      },
    })
    expect(await restoreItemsAction({ ids: [gift, water] })).toMatchObject({ ok: true })
  })

  it('구성품 선택지: 같은 화주사의 세트가 아닌 품목, 범위 밖 화주사는 빈 목록', async () => {
    await createOk({ code: 'WATER' })
    const water = (await prisma.item.findFirstOrThrow({ where: { code: 'WATER' } })).id
    await createOk({
      code: 'GIFT',
      itemType: 'SET',
      components: [{ itemId: String(water), qty: '1' }],
    })
    await createOk({ code: 'OTHER', shipperId: dara })

    const options = await listSetComponentOptionsAction({ shipperId: String(gana) })
    expect(options.ok && options.data.map((o) => [o.code, o.baseUnit])).toEqual([['WATER', 'EA']])

    vi.mocked(getCurrentScope).mockResolvedValue({
      kind: 'SHIPPER',
      operatorId: TEST_OPERATOR_ID,
      shipperId: dara,
    })
    const outside = await listSetComponentOptionsAction({ shipperId: String(gana) })
    expect(outside).toMatchObject({ ok: true, data: [] })
  })
})
