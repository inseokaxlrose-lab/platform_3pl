import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { deleteUnitsAction } from '@/app/admin/master/units/actions'
import type { ItemCreateInput } from '@/lib/items/item-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestShipper, versionOf } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createItemAction,
  deleteItemsAction,
  listItemsAction,
  restoreItemsAction,
  setItemsActiveAction,
  updateItemAction,
} from './actions'
import { getItemForEdit } from '@/lib/items/item-queries'

// 품목 (docs/decisions/0041)

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
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

// 테스트 준비: 단위·센터·화주사
const unitIds: Record<string, bigint> = {}
async function createUnit(code: string, kind: 'BASE' | 'PACK', decimals = 0, isActive = true) {
  const unit = await prisma.unit.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      code,
      name: code,
      kind,
      decimals,
      status: isActive ? 'ACTIVE' : 'INACTIVE',
    },
  })
  unitIds[code] = unit.id
}

let gana = 0n // 식품 화주사: 로트·유통기한 사용, 라벨 BOX — 이천센터 이용
let dara = 0n // 전자 화주사: 둘 다 안 씀, 라벨 PLT — 김해센터 이용
let icn = 0n

const input = (overrides: Partial<ItemCreateInput> = {}): ItemCreateInput => ({
  shipperId: String(gana),
  code: '',
  name: '생수 500ml',
  spec: '500ml × 20',
  barcode: '',
  baseUnitId: String(unitIds.EA),
  useLot: '',
  useExpiry: '',
  labelUnit: '',
  expiryAlertDays: '30',
  remark: '',
  units: [{ unitId: String(unitIds.BOX), convQty: '24' }],
  externalCodes: { SAP: '', ERP: '' },
  ...overrides,
})

async function create(overrides: Partial<ItemCreateInput> = {}) {
  const result = await createItemAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const update = async (id: string, overrides: Partial<ItemCreateInput> = {}) => {
  const { shipperId, ...rest } = input(overrides)
  void shipperId
  return updateItemAction({ ...rest, id, rowVersion: await versionOf('item', id) })
}

beforeEach(async () => {
  await resetDatabase()
  await createUnit('EA', 'BASE')
  await createUnit('KG', 'BASE', 3)
  await createUnit('OLD', 'BASE', 0, false)
  await createUnit('BOX', 'PACK')
  await createUnit('PLT', 'PACK')
  icn = (await createTestCenter('ICN')).id
  const gmh = (await createTestCenter('GMH')).id
  gana = (await createTestShipper('GANA')).id
  dara = (await createTestShipper('DARA')).id
  await prisma.shipper.update({
    where: { id: gana },
    data: {
      useLot: 'Y',
      useExpiry: 'Y',
      labelUnit: 'BOX',
      centers: { create: [{ centerId: icn }] },
    },
  })
  await prisma.shipper.update({
    where: { id: dara },
    data: { centers: { create: [{ centerId: gmh }] } },
  })
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('품목 등록', () => {
  it('시스템 코드 자동, 품목코드 비우면 시스템 코드, 환산단위·외부 코드 함께, 운영사 자동', async () => {
    const created = await create({ externalCodes: { SAP: 'M-100', ERP: '' } })
    const saved = await prisma.item.findUniqueOrThrow({
      where: { id: BigInt(created.id) },
      include: { units: true },
    })
    expect(saved.systemCode).toMatch(/^IT\d{8}$/)
    expect(saved).toMatchObject({
      code: saved.systemCode,
      operatorId: TEST_OPERATOR_ID,
      shipperId: gana,
      useLot: null,
      useExpiry: null,
      labelUnit: null,
      expiryAlertDays: 30,
      createdBy: 'boss',
    })
    expect(saved.units.map((u) => [u.unitId, u.convQty.toString()])).toEqual([[unitIds.BOX, '24']])
    expect(await getExternalCodes('ITEM', BigInt(created.id))).toEqual({ SAP: 'M-100', ERP: '' })
  })

  it('품목코드·바코드는 같은 화주사 안에서만 겹칠 수 없다 (다른 화주사는 같은 코드 가능)', async () => {
    await create({ code: 'sku-1', barcode: '8801234' })
    expect(await createItemAction(input({ code: 'SKU-1' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('품목코드') },
    })
    expect(await createItemAction(input({ code: 'SKU-2', barcode: '8801234' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('바코드') },
    })
    expect(
      (
        await createItemAction(
          input({ shipperId: String(dara), code: 'SKU-1', barcode: '8801234' }),
        )
      ).ok,
    ).toBe(true)
    // 시스템 코드 모양은 쓸 수 없다
    expect(await createItemAction(input({ code: 'IT00009999' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })

  it('단위: 기본단위는 사용 중인 기본단위, 환산단위는 환산단위만, 입수량 소수는 기본단위 자리수까지', async () => {
    const fail = async (overrides: Partial<ItemCreateInput>, message: string) =>
      expect(await createItemAction(input(overrides))).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION', message: expect.stringContaining(message) },
      })
    await fail({ baseUnitId: String(unitIds.BOX) }, '기본단위는')
    await fail({ baseUnitId: String(unitIds.OLD) }, '기본단위는')
    await fail({ units: [{ unitId: String(unitIds.KG), convQty: '1' }] }, '환산단위는')
    await fail({ units: [{ unitId: String(unitIds.BOX), convQty: '2.5' }] }, '정수로')
    // KG(소수 3자리)는 2.5 가능, 4자리는 안 됨
    expect(
      (
        await createItemAction(
          input({
            baseUnitId: String(unitIds.KG),
            units: [{ unitId: String(unitIds.BOX), convQty: '2.5' }],
          }),
        )
      ).ok,
    ).toBe(true)
    await fail(
      {
        baseUnitId: String(unitIds.KG),
        units: [{ unitId: String(unitIds.BOX), convQty: '2.5001' }],
      },
      '소수 3자리',
    )
  })

  it('유통기한을 실제로 쓰지 않으면 임박 기준 일수는 비운다 (화주사 기본값 기준)', async () => {
    const created = await create({ shipperId: String(dara), expiryAlertDays: '30' })
    expect(
      (await prisma.item.findUniqueOrThrow({ where: { id: BigInt(created.id) } })).expiryAlertDays,
    ).toBeNull()
    const own = await create({ shipperId: String(dara), useExpiry: 'Y', expiryAlertDays: '14' })
    expect(
      (await prisma.item.findUniqueOrThrow({ where: { id: BigInt(own.id) } })).expiryAlertDays,
    ).toBe(14)
  })

  it('사용 중지된 화주사에는 등록할 수 없다', async () => {
    await prisma.shipper.update({ where: { id: dara }, data: { status: 'INACTIVE' } })
    expect(await createItemAction(input({ shipperId: String(dara) }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('사용 중지된 화주사') },
    })
  })
})

describe('품목 수정 · 목록', () => {
  it('환산단위를 통째로 바꾸고, 화주사는 그대로, 버전이 다르면 충돌', async () => {
    const created = await create({ code: 'SKU-1' })
    expect(
      await update(created.id, {
        name: '생수 2L',
        units: [
          { unitId: String(unitIds.PLT), convQty: '1440' },
          { unitId: String(unitIds.BOX), convQty: '6' },
        ],
      }),
    ).toMatchObject({ ok: true })
    const edit = await getItemForEdit(BigInt(created.id), ALL)
    expect(edit).toMatchObject({
      shipperId: String(gana),
      input: {
        name: '생수 2L',
        units: [
          { unitId: String(unitIds.PLT), convQty: '1440' },
          { unitId: String(unitIds.BOX), convQty: '6' },
        ],
      },
    })
    expect(await updateItemAction({ ...input(), id: created.id, rowVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('목록: 실제로 적용되는 관리 옵션, 라벨 단위 입수량 없음 표시, 거르기도 적용값 기준', async () => {
    await create({ code: 'FOOD' }) // GANA 기본값: 로트·유통기한 사용, 라벨 BOX (BOX 있음)
    await create({ shipperId: String(dara), code: 'TV', units: [] }) // DARA: 안 씀, 라벨 PLT (없음)
    await create({ shipperId: String(dara), code: 'LOTTV', useLot: 'Y', units: [] })
    const rows = async (filters: Record<string, string> = {}) => {
      const result = await listItemsAction({ ...createDataGridState(), filters })
      return result.ok ? result.data.rows : []
    }
    expect(
      (await rows()).map((r) => [r.code, r.useLot, r.useExpiry, r.labelUnit, r.labelUnitMissing]),
    ).toEqual([
      ['FOOD', true, true, 'BOX', false],
      ['LOTTV', true, false, 'PLT', true],
      ['TV', false, false, 'PLT', true],
    ])
    expect((await rows({ lot: 'Y' })).map((r) => r.code)).toEqual(['FOOD', 'LOTTV'])
    expect((await rows({ shipper: String(dara) })).map((r) => r.code)).toEqual(['LOTTV', 'TV'])
  })
})

describe('데이터 범위', () => {
  it('센터 직원: 소속 센터를 이용하는 화주사의 품목만 보고, 다른 화주사 품목은 고치거나 등록할 수 없다', async () => {
    await create({ code: 'FOOD' })
    const tv = await create({ shipperId: String(dara), code: 'TV' })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [icn] })

    const result = await listItemsAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['FOOD'])
    expect(
      await getItemForEdit(BigInt(tv.id), {
        kind: 'CENTERS',
        operatorId: TEST_OPERATOR_ID,
        centerIds: [icn],
      }),
    ).toBeNull()
    expect(await update(tv.id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await createItemAction(input({ shipperId: String(dara) }))).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    // 자기 센터를 이용하는 화주사에는 대신 등록할 수 있다
    expect((await createItemAction(input({ code: 'FOOD2' }))).ok).toBe(true)
  })

  it('화주사 사용자: 자기 화주사 품목만', async () => {
    await create({ code: 'FOOD' })
    await create({ shipperId: String(dara), code: 'TV' })
    signIn({ kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: dara })
    const result = await listItemsAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['TV'])
  })
})

describe('사용 중지 · 삭제 · 되살리기 · 단위 사용 검사', () => {
  it('사용 중지 / 다시 사용, 지우면 목록에서 빠지고 "삭제됨"에서 되살린다', async () => {
    const a = await create({ code: 'A1' })
    expect(await setItemsActiveAction({ ids: [a.id], isActive: false })).toEqual({
      ok: true,
      data: { count: 1 },
    })
    expect(await deleteItemsAction({ ids: [a.id] })).toEqual({ ok: true, data: { count: 1 } })
    const visible = await listItemsAction(createDataGridState())
    expect(visible.ok && visible.data.rows).toEqual([])
    const deleted = await listItemsAction({
      ...createDataGridState(),
      filters: { status: 'DELETED' },
    })
    expect(deleted.ok && deleted.data.rows.map((r) => r.code)).toEqual(['A1'])

    // 같은 품목코드가 다시 생겼으면 되살릴 수 없다
    const b = await create({ code: 'A1' })
    expect(await restoreItemsAction({ ids: [a.id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    await deleteItemsAction({ ids: [b.id] })
    expect(await restoreItemsAction({ ids: [a.id] })).toEqual({ ok: true, data: { count: 1 } })
  })

  it('품목에서 쓰는 단위(기본단위·환산단위)는 지울 수 없고, 품목을 지우면 지울 수 있다', async () => {
    const item = await create({ code: 'A1' })
    for (const code of ['EA', 'BOX']) {
      expect(await deleteUnitsAction({ ids: [String(unitIds[code])] })).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT', message: expect.stringContaining('품목에서 쓰는 단위') },
      })
    }
    await deleteItemsAction({ ids: [item.id] })
    expect(await deleteUnitsAction({ ids: [String(unitIds.BOX)] })).toMatchObject({ ok: true })
  })
})
