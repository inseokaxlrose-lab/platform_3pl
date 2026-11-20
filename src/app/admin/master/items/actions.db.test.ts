import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { deleteUnitsAction } from '@/app/admin/master/units/actions'
import { runInContext } from '@/lib/actor'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { getItemForEdit } from '@/lib/items/item-queries'
import type { ItemInput } from '@/lib/items/item-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createTestCenter, createTestShipper, versionOf, systemUnit } from '@/test/factories'
import { barcodeRow, itemInput, unitRow, withExpiry, withLot } from '@/test/item-input'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createItemAction,
  deleteItemsAction,
  listItemsAction,
  restoreItemsAction,
  setItemsActiveAction,
  updateItemAction,
} from './actions'

// 품목 (docs/decisions/0041, 0083)

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
// 운영사 추가 단위 (시스템 기본 단위에 없는 코드, 0078)
async function createUnit(code: string, type: 'QTY' | 'PACK', isActive = true) {
  const unit = await prisma.unit.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      code,
      name: code,
      type,
      status: isActive ? 'ACTIVE' : 'INACTIVE',
    },
  })
  unitIds[code] = unit.id
}
// 시스템 기본 단위 (EA 0자리·KG 3자리·BOX·PLT)
async function useSystemUnit(code: string) {
  unitIds[code] = (await systemUnit(code)).id
}

let gana = 0n // 식품 화주사: 로트·유통기한 사용, 라벨 BOX — 이천센터 이용
let dara = 0n // 전자 화주사: 둘 다 안 씀, 라벨 PLT — 김해센터 이용
let icn = 0n

// 자주 쓰는 단위 행
const base = (unit = 'EA') => unitRow('BASE', unitIds[unit], '1')
const box = (convQty = '24', size: Parameters<typeof unitRow>[3] = {}) =>
  unitRow('BOX', unitIds.BOX, convQty, size)
// 정상 BOX 규격: 30×20×25cm, 12kg (밀도 800kg/m³)
const BOX_SIZE = { widthCm: '30', depthCm: '20', heightCm: '25', grossWeightKg: '12' }

type CreateOverrides = Partial<ItemInput> & { shipperId?: string; code?: string }

// 기본: 가나 화주사, 품목코드 WATER, EA + BOX 24
const input = ({ shipperId, code, ...overrides }: CreateOverrides = {}) => ({
  shipperId: shipperId ?? String(gana),
  code: code ?? 'WATER',
  ...itemInput(unitIds.EA, { units: [base(), box()], ...overrides }),
})

async function create(overrides: CreateOverrides = {}) {
  const result = await createItemAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const update = async (id: string, overrides: Partial<ItemInput> = {}) => {
  const { shipperId, code, ...rest } = input(overrides)
  void shipperId
  void code
  return updateItemAction({ ...rest, id, rowVersion: await versionOf('item', id) })
}

const savedItem = (id: string) =>
  prisma.item.findUniqueOrThrow({
    where: { id: BigInt(id) },
    include: {
      units: { orderBy: { sortOrder: 'asc' }, include: { unit: { select: { code: true } } } },
      barcodes: { orderBy: { id: 'asc' } },
    },
  })

// 저장 결과의 경고 코드만
const warningCodes = (result: { ok: boolean; data?: unknown }) =>
  result.ok ? (result.data as { warnings: { code: string }[] }).warnings.map((w) => w.code) : null

beforeEach(async () => {
  await resetDatabase()
  await useSystemUnit('EA')
  await useSystemUnit('KG')
  await createUnit('OLD', 'QTY', false)
  await useSystemUnit('BOX')
  await useSystemUnit('PLT')
  await createUnit('PCS', 'QTY')
  await createUnit('CS', 'PACK')
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
    data: { labelUnit: 'PLT', centers: { create: [{ centerId: gmh }] } },
  })
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('품목 등록', () => {
  it('시스템 코드 자동, 품목코드 그대로(대문자), 단위는 레벨별 행, 관리 여부는 명시값, 운영사·출처 자동', async () => {
    const created = await create({ code: 'sku-1', ...withExpiry, ...withLot })
    const saved = await savedItem(created.id)
    expect(saved).toMatchObject({
      code: 'SKU-1',
      operatorId: TEST_OPERATOR_ID,
      shipperId: gana,
      source: 'SCREEN',
      itemType: 'GOODS',
      setYn: 'N',
      useLot: 'Y',
      lotSource: 'INPUT',
      useExpiry: 'Y',
      expiryType: 'SELL',
      expiryInput: 'EXPIRY',
      expiryAlertDays: 30,
      // 비우면 자동 (입고 = BOX, 주문 = 기본단위)
      defaultInboundUnitId: null,
      defaultOrderUnitId: null,
      createdBy: 'boss',
    })
    expect(
      saved.units.map((u) => [u.level, u.unit.code, u.convQty.toString(), u.autoCalcYn]),
    ).toEqual([
      ['BASE', 'EA', '1', 'N'],
      ['BOX', 'BOX', '24', 'N'],
    ])
  })

  it('BOX 규격이 없으면 저장은 되고 "체적 미등록" 경고, 규격이 있으면 CBM 자동 계산', async () => {
    const bare = await createItemAction(input({ code: 'BARE' }))
    expect(warningCodes(bare)).toEqual(['VOLUME_MISSING'])
    expect(bare).toMatchObject({
      ok: true,
      data: { notice: expect.stringContaining('체적 미등록') },
    })

    const sized = await createItemAction(
      input({ code: 'SIZED', units: [base(), box('24', BOX_SIZE)] }),
    )
    expect(warningCodes(sized)).toEqual([])
    const row = (await savedItem(sized.ok ? sized.data.id : '')).units[1]
    expect(row.cbm?.toString()).toBe('0.015')
  })

  it('기한·LOT을 관리하지 않으면 기한 칸은 비워 저장한다 (화면이 남긴 값이 있어도)', async () => {
    const created = await create({
      useExpiry: false,
      expiryType: 'SELL',
      expiryInput: 'EXPIRY',
      expiryAlertDays: 30,
      useLot: false,
      lotSource: 'INPUT',
    })
    expect(await savedItem(created.id)).toMatchObject({
      useExpiry: 'N',
      expiryType: null,
      expiryAlertDays: null,
      useLot: 'N',
      lotSource: null,
    })
  })

  it('품목코드는 같은 화주사 안에서만 겹칠 수 없다 (다른 화주사는 같은 코드 가능)', async () => {
    await create({ code: 'SKU-1' })
    expect(await createItemAction(input({ code: 'sku-1' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('품목코드') },
    })
    expect((await createItemAction(input({ shipperId: String(dara), code: 'SKU-1' }))).ok).toBe(
      true,
    )
    // 품목코드를 비우면 자동 체번: 화주 접두어 + S + 6자리 (0084)
    const auto = await createItemAction(input({ code: '' }))
    expect(auto).toMatchObject({ ok: true })
    const prefix = (await prisma.shipper.findUniqueOrThrow({ where: { id: gana } })).codePrefix
    expect(auto.ok && auto.data.code).toBe(`${prefix}S000001`)
    // 자동 체번 모양은 직접 넣을 수 없다
    expect(await createItemAction(input({ code: `${prefix}S000099` }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('자동 체번 모양') },
    })
  })

  it('일시정지·해지 화주사에는 등록할 수 없다 (준비중·운영중만, 0080)', async () => {
    await prisma.shipper.update({
      where: { id: dara },
      data: { status: 'SUSPENDED', statusReason: '점검' },
    })
    expect(await createItemAction(input({ shipperId: String(dara) }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('준비중·운영중') },
    })
  })
})

describe('단위 검사', () => {
  const fail = async (overrides: CreateOverrides, message: string) =>
    expect(await createItemAction(input(overrides))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining(message) },
    })

  it('기본단위는 사용 중인 포장 아닌 단위, 다른 레벨은 사용 중인 포장 단위만', async () => {
    await fail(
      { baseUnitId: String(unitIds.BOX), units: [unitRow('BASE', unitIds.BOX, '1')] },
      '기본단위는',
    )
    await fail(
      { baseUnitId: String(unitIds.OLD), units: [unitRow('BASE', unitIds.OLD, '1')] },
      '기본단위는',
    )
    await fail(
      { units: [base(), unitRow('BOX', unitIds.KG, '24')] },
      'BOX 단위는 사용 중인 포장 단위',
    )
  })

  it('환산수량 소수는 기본단위 자리수까지 (EA 정수, KG 3자리)', async () => {
    await fail({ units: [base(), box('2.5')] }, '정수로')
    const kg = { baseUnitId: String(unitIds.KG), units: [base('KG'), box('2.5')] }
    expect((await createItemAction(input({ code: 'RICE', ...kg }))).ok).toBe(true)
    await fail({ ...kg, units: [base('KG'), box('2.5001')] }, '소수 3자리')
  })

  it('상위 레벨이 하위 레벨보다 커야 한다: BOX가 기본단위보다 작으면 오류, BOX가 INNER의 배수가 아니면 경고', async () => {
    // KG 기본단위에 BOX 0.5 (1 BOX = 0.5 KG) → 기본보다 작음
    await fail(
      { baseUnitId: String(unitIds.KG), units: [base('KG'), box('0.5')] },
      '보다 커야 합니다',
    )
    // INNER 12 > BOX 6 → 오류
    await fail(
      { units: [base(), unitRow('INNER', unitIds.CS, '12'), box('6')] },
      '보다 커야 합니다',
    )
    // INNER 5, BOX 24 → 저장되지만 배수 아님 경고
    const result = await createItemAction(
      input({ units: [base(), unitRow('INNER', unitIds.CS, '5'), box('24', BOX_SIZE)] }),
    )
    expect(warningCodes(result)).toEqual(['UOM_NOT_MULTIPLE'])
  })

  it('mm로 잘못 넣으면(체적 1000배) 밀도 이상 경고 — 저장은 된다', async () => {
    const result = await createItemAction(
      input({
        units: [
          base(),
          box('24', { widthCm: '300', depthCm: '200', heightCm: '250', grossWeightKg: '12' }),
        ],
      }),
    )
    expect(result.ok).toBe(true)
    expect(warningCodes(result)).toEqual(['DENSITY_SUSPICIOUS'])
  })

  it('기본 입고·주문단위는 이 품목의 단위 중에서', async () => {
    await fail({ defaultInboundUnitId: String(unitIds.PLT) }, '기본 입고단위')
    const created = await create({
      defaultInboundUnitId: String(unitIds.BOX),
      defaultOrderUnitId: String(unitIds.EA),
    })
    expect(await savedItem(created.id)).toMatchObject({
      defaultInboundUnitId: unitIds.BOX,
      defaultOrderUnitId: unitIds.EA,
    })
  })
})

describe('팔레트 적재 → PLT', () => {
  const pallet = { palletTypeCode: 'T11', palletTi: 10, palletHi: 5 }

  it('팔레트 종류·TI·HI가 있으면 PLT를 계산한다 (수량·규격·높이·중량·CBM, 자동 계산 표시)', async () => {
    const created = await create({ ...pallet, units: [base(), box('24', BOX_SIZE)] })
    const saved = await savedItem(created.id)
    expect(saved).toMatchObject({
      palletTypeCode: 'T11',
      palletTi: 10,
      palletHi: 5,
      palletBoxQty: 50,
    })
    const plt = saved.units.find((u) => u.level === 'PLT')!
    // 50 BOX × 24 = 1200 EA, 높이 5단 × 25 + 팔레트 15 = 140cm, 중량 50 × 12 + 25 = 625kg, 1.1 × 1.1 × 1.4
    expect({
      unit: plt.unit.code,
      convQty: plt.convQty.toString(),
      widthCm: plt.widthCm?.toString(),
      heightCm: plt.heightCm?.toString(),
      grossWeightKg: plt.grossWeightKg?.toString(),
      cbm: plt.cbm?.toString(),
      autoCalcYn: plt.autoCalcYn,
    }).toEqual({
      unit: 'PLT',
      convQty: '1200',
      widthCm: '110',
      heightCm: '140',
      grossWeightKg: '625',
      cbm: '1.694',
      autoCalcYn: 'Y',
    })
  })

  it('보낸 PLT 값이 계산과 다르면 계산값으로 바꾸고 알린다, 권장 높이를 넘으면 경고', async () => {
    const result = await createItemAction(
      input({
        ...pallet,
        palletHi: 7,
        units: [base(), box('24', BOX_SIZE), unitRow('PLT', unitIds.PLT, '1000')],
      }),
    )
    expect(warningCodes(result)).toEqual(['PLT_RECALCULATED', 'PALLET_HEIGHT_EXCEEDED'])
    const plt = (await savedItem(result.ok ? result.data.id : '')).units.find(
      (u) => u.level === 'PLT',
    )!
    expect(plt.convQty.toString()).toBe('1680')
  })

  it('적재 정보가 없으면 PLT 환산수량을 직접 넣는다 (자동 계산 아님)', async () => {
    const created = await create({
      units: [base(), box('24', BOX_SIZE), unitRow('PLT', unitIds.PLT, '1440')],
    })
    const plt = (await savedItem(created.id)).units.find((u) => u.level === 'PLT')!
    expect([plt.convQty.toString(), plt.autoCalcYn]).toEqual(['1440', 'N'])
  })

  it('팔레트당 박스 수만 넣어도 수량은 계산, BOX가 없거나 없는 팔레트 종류면 거부', async () => {
    const created = await create({ palletBoxQty: 40, units: [base(), box('24')] })
    expect(
      (await savedItem(created.id)).units.find((u) => u.level === 'PLT')?.convQty.toString(),
    ).toBe('960')
    expect(
      await createItemAction(input({ code: 'NOBOX', ...pallet, units: [base()] })),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('BOX 단위가 필요') },
    })
    expect(
      await createItemAction(input({ code: 'NOPAL', ...pallet, palletTypeCode: 'X99' })),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('X99') },
    })
  })
})

describe('바코드', () => {
  // 체크디지트가 맞는 EAN-13
  const EAN_A = '8801234567893'
  const EAN_B = '8801234567886'

  it('체크디지트를 검사하고, 단위별 대표가 없으면 첫 바코드를 대표로', async () => {
    expect(
      await createItemAction(input({ barcodes: [barcodeRow(unitIds.EA, '8801234567890')] })),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('체크디지트') },
    })
    const created = await create({
      barcodes: [
        barcodeRow(unitIds.EA, EAN_A),
        barcodeRow(unitIds.EA, EAN_B),
        barcodeRow(unitIds.BOX, 'BOX-1', { barcodeType: 'CUSTOM' }),
      ],
    })
    expect((await savedItem(created.id)).barcodes.map((b) => [b.barcode, b.isPrimary])).toEqual([
      [EAN_A, 'Y'],
      [EAN_B, 'N'],
      ['BOX-1', 'Y'],
    ])
  })

  it('같은 화주사의 다른 품목과 겹칠 수 없고, 다른 화주사는 같은 바코드 가능, 품목을 지우면 다시 쓸 수 있다', async () => {
    const first = await create({ code: 'A1', barcodes: [barcodeRow(unitIds.EA, EAN_A)] })
    expect(
      await createItemAction(input({ code: 'A2', barcodes: [barcodeRow(unitIds.EA, EAN_A)] })),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('A1') },
    })
    expect(
      (
        await createItemAction(
          input({ shipperId: String(dara), code: 'A2', barcodes: [barcodeRow(unitIds.EA, EAN_A)] }),
        )
      ).ok,
    ).toBe(true)
    await deleteItemsAction({ ids: [first.id] })
    expect(
      (await createItemAction(input({ code: 'A3', barcodes: [barcodeRow(unitIds.EA, EAN_A)] }))).ok,
    ).toBe(true)
  })

  it('목록은 바코드로도 찾고, 대표 바코드(기본단위)를 보여 준다', async () => {
    await create({ code: 'A1', barcodes: [barcodeRow(unitIds.EA, EAN_A)] })
    await create({ code: 'B1' })
    const result = await listItemsAction({ ...createDataGridState(), search: '567893' })
    expect(result.ok && result.data.rows.map((r) => [r.code, r.barcode])).toEqual([['A1', EAN_A]])
  })
})

describe('품목 수정', () => {
  it('화주사·품목코드는 그대로, 환산수량을 바꾸면 이력을 남기고, 버전이 다르면 충돌', async () => {
    const created = await create({ code: 'SKU-1' })
    expect(await update(created.id, { name: '생수 2L', units: [base(), box('6')] })).toMatchObject({
      ok: true,
    })
    const edit = await getItemForEdit(BigInt(created.id), ALL)
    expect(edit).toMatchObject({
      code: 'SKU-1',
      shipperId: String(gana),
      structureLock: null,
      input: {
        name: '생수 2L',
        units: [
          { level: 'BASE', unitId: String(unitIds.EA), convQty: '1' },
          { level: 'BOX', unitId: String(unitIds.BOX), convQty: '6' },
        ],
      },
    })
    const hist = await prisma.itemUnitHist.findMany({ where: { itemId: BigInt(created.id) } })
    expect(
      hist.map((h) => [h.unitCode, h.beforeQty?.toString(), h.afterQty?.toString(), h.changedBy]),
    ).toEqual([['BOX', '24', '6', 'boss']])
    expect(await updateItemAction({ ...input(), id: created.id, rowVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('재고가 있으면 LOT·기한 관리 여부와 기본단위는 바꿀 수 없다 (다른 칸은 바꿀 수 있다)', async () => {
    const created = await create()
    const inbound = await ensureCenterDefaults(prisma, icn)
    const location = await prisma.location.findFirstOrThrow({ where: { warehouseId: inbound!.id } })
    await runInContext({ actor: 'test', operatorId: TEST_OPERATOR_ID }, () =>
      stockTransaction((tx) =>
        receiveStock(tx, {
          address: { locationId: location.id, itemId: BigInt(created.id) },
          qty: '10',
        }),
      ),
    )
    expect(await getItemForEdit(BigInt(created.id), ALL)).toMatchObject({
      structureLock: '재고가 있어',
    })
    expect(await update(created.id, withLot)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('재고가 있어') },
    })
    expect(
      await update(created.id, { baseUnitId: String(unitIds.PCS), units: [base('PCS'), box()] }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(await update(created.id, { name: '생수 1L' })).toMatchObject({ ok: true })
  })
})

describe('목록', () => {
  it('실제로 적용되는 관리 옵션(명시값), 라벨 단위 입수량 없음 표시, 거르기도 적용값 기준', async () => {
    await create({ code: 'FOOD', ...withLot, ...withExpiry }) // GANA 라벨 BOX (BOX 있음)
    await create({ shipperId: String(dara), code: 'TV' }) // DARA 라벨 PLT (없음)
    await create({ shipperId: String(dara), code: 'LOTTV', ...withLot })
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
    const centerScope: DataScope = {
      kind: 'CENTERS',
      operatorId: TEST_OPERATOR_ID,
      centerIds: [icn],
    }
    signIn(centerScope)

    const result = await listItemsAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['FOOD'])
    expect(await getItemForEdit(BigInt(tv.id), centerScope)).toBeNull()
    expect(await update(tv.id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await createItemAction(input({ shipperId: String(dara), code: 'TV2' }))).toMatchObject({
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

  it('품목에서 쓰는 운영사 단위(기본단위·포장단위)는 지울 수 없고, 품목을 지우면 지울 수 있다. 시스템 단위는 늘 거부', async () => {
    const item = await create({
      code: 'A1',
      baseUnitId: String(unitIds.PCS),
      units: [base('PCS'), unitRow('BOX', unitIds.CS, '12')],
    })
    for (const code of ['PCS', 'CS']) {
      expect(await deleteUnitsAction({ ids: [String(unitIds[code])] })).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT', message: expect.stringContaining('쓰는 곳이 있어') },
      })
    }
    await deleteItemsAction({ ids: [item.id] })
    expect(await deleteUnitsAction({ ids: [String(unitIds.CS)] })).toMatchObject({ ok: true })
    expect(await deleteUnitsAction({ ids: [String(unitIds.BOX)] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
