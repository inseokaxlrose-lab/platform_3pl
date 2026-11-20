import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import type { WarehouseCreateInput } from '@/lib/warehouses/warehouse-schema'
import { createTestCodeGroup, versionOf } from '@/test/factories'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createWarehouseAction,
  deleteWarehousesAction,
  listWarehousesAction,
  restoreWarehousesAction,
  setWarehousesActiveAction,
  updateWarehouseAction,
} from './actions'

// 창고 서버 액션 (docs/decisions/0027, 0074)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const CODES: PermissionCode[] = [
  'master.warehouses.read',
  'master.warehouses.create',
  'master.warehouses.update',
  'master.warehouses.delete',
]

function signIn(scope: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }, codes = CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '사용자',
    username: 'u1',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let f: InboundFixture

// 일반 보관 창고 입력 (이천센터, 상온)
const input = (overrides: Partial<WarehouseCreateInput> = {}): WarehouseCreateInput => ({
  centerId: String(f.icn),
  code: 'A01',
  name: '상온 1창고',
  type: 'STORAGE',
  tempZone: 'AMBIENT',
  description: '',
  sortOrder: 10,
  remark: '',
  buildingName: '',
  floorNo: '',
  areaM2: '',
  inbound: true,
  outbound: true,
  allocatable: true,
  defaultStockStatus: 'NORMAL',
  allocPriority: 100,
  defaultLocId: '',
  ...overrides,
})
// 수정 입력: 센터·코드는 보내지 않는다 (바꿀 수 없음)
const updateInput = (overrides: Partial<WarehouseCreateInput> = {}) => {
  const rest: Partial<WarehouseCreateInput> = { ...input(overrides) }
  delete rest.centerId
  delete rest.code
  return rest as Omit<WarehouseCreateInput, 'centerId' | 'code'>
}

async function create(overrides: Partial<WarehouseCreateInput> = {}) {
  const result = await createWarehouseAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

async function update(id: string | bigint, overrides: Partial<WarehouseCreateInput> = {}) {
  return updateWarehouseAction({
    id: String(id),
    rowVersion: await versionOf('warehouse', id),
    ...updateInput(overrides),
  })
}

// 시스템 기본 창고 (센터 등록 때 자동 생성)
const systemOf = (centerId: bigint, type: 'INBOUND' | 'OUTBOUND' | 'RETURN') =>
  prisma.warehouse.findFirstOrThrow({ where: { centerId, type, systemYn: 'Y' } })
// 준비 데이터의 이천 보관 창고 GEN (로케이션 A-01·A-02)
const genWarehouse = () =>
  prisma.warehouse.findFirstOrThrow({ where: { centerId: f.icn, code: 'GEN' } })

// GEN 창고 A-01에 재고 넣기
const stockUp = () =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
    stockTransaction((tx) =>
      receiveStock(tx, { address: { locationId: f.a01, itemId: f.water }, qty: '10' }),
    ),
  )

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('창고 등록', () => {
  it('코드(대문자)·유형·운영 속성을 저장하고, 사용자가 만든 창고는 시스템 기본 창고가 아니다', async () => {
    const created = await create({
      code: 'qc_1',
      type: 'QC',
      inbound: true,
      outbound: false,
      allocatable: false,
      defaultStockStatus: 'HOLD',
      buildingName: 'A동',
      floorNo: 'B1',
      areaM2: '1200.5',
    })
    const saved = await prisma.warehouse.findUniqueOrThrow({ where: { id: BigInt(created.id) } })
    expect(saved).toMatchObject({
      code: 'QC_1',
      type: 'QC',
      tempZone: 'AMBIENT',
      systemYn: 'N',
      inboundYn: 'Y',
      outboundYn: 'N',
      allocatableYn: 'N',
      defaultStockStatus: 'HOLD',
      buildingName: 'A동',
      floorNo: 'B1',
      // 2차 칸: 보내지 않으면 기본값
      bondedYn: 'N',
      hazmatYn: 'N',
      allocPriority: 100,
    })
    expect(saved.areaM2?.toString()).toBe('1200.5')
  })

  it('창고코드: 필수, 같은 센터 안에서만 중복 금지', async () => {
    expect(await createWarehouseAction(input({ code: '' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    await create({ code: 'A01' })
    expect(await createWarehouseAction(input({ code: 'A01' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    // 다른 센터는 같은 코드 가능
    expect((await createWarehouseAction(input({ centerId: String(f.gmh), code: 'A01' }))).ok).toBe(
      true,
    )
    expect(await createWarehouseAction(input({ code: 'A-1' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })

  it('사용자 정의 코드: 같은 센터 안에서만 중복 금지 (0093)', async () => {
    await create({ code: 'A01', custCode: 'Z-1' })
    expect(await createWarehouseAction(input({ code: 'A02', custCode: 'Z-1' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('A01') },
    })
    expect(
      (
        await createWarehouseAction(
          input({ centerId: String(f.gmh), code: 'A02', custCode: 'Z-1' }),
        )
      ).ok,
    ).toBe(true)
  })

  it('온도대는 센터 취급 온도대 안에서만, 보세는 보세 센터만', async () => {
    expect(await createWarehouseAction(input({ tempZone: 'FROZEN' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('상온') },
    })
    await prisma.centerTempZone.create({ data: { centerId: f.icn, tempZoneCd: 'FROZEN' } })
    expect((await createWarehouseAction(input({ tempZone: 'FROZEN' }))).ok).toBe(true)

    // 2차 칸(API만): 보세 센터가 아니면 보세 구역 불가
    expect(
      await createWarehouseAction({ ...input({ code: 'BW1' }), bondedYn: true }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    await prisma.center.update({ where: { id: f.icn }, data: { bondedYn: 'Y' } })
    expect((await createWarehouseAction({ ...input({ code: 'BW1' }), bondedYn: true })).ok).toBe(
      true,
    )
  })

  it('일시중지 센터에는 추가할 수 없다', async () => {
    await prisma.center.update({
      where: { id: f.icn },
      data: { status: 'SUSPENDED', statusReason: '점검' },
    })
    expect(await createWarehouseAction(input())).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('센터에 출고 할당 가능한 창고가 없으면 저장은 되고 안내를 돌려준다', async () => {
    // 준비 데이터의 GEN 창고(할당 가능)를 할당 불가로 → 센터에 할당 가능 창고 없음
    const gen = await genWarehouse()
    await prisma.warehouse.update({ where: { id: gen.id }, data: { allocatableYn: 'N' } })
    const result = await createWarehouseAction(
      input({ code: 'VAS1', type: 'VAS', allocatable: false }),
    )
    expect(result).toMatchObject({ ok: true, data: { notice: expect.stringContaining('할당') } })
    const ok = await createWarehouseAction(input({ code: 'ST1' }))
    expect(ok).toMatchObject({ ok: true, data: { notice: null } })
  })
})

describe('창고 수정', () => {
  it('코드·센터는 바뀌지 않고, 나머지 칸은 고친다', async () => {
    const created = await create()
    const result = await updateWarehouseAction({
      id: created.id,
      rowVersion: await versionOf('warehouse', created.id),
      ...updateInput({ name: '바뀐 이름', sortOrder: 5, description: '설명' }),
      // 코드를 보내도 무시된다 (입력 규칙에 없음)
      ...({ code: 'ZZZ' } as object),
    })
    expect(result.ok).toBe(true)
    const saved = await prisma.warehouse.findUniqueOrThrow({ where: { id: BigInt(created.id) } })
    expect(saved).toMatchObject({
      code: 'A01',
      name: '바뀐 이름',
      sortOrder: 5,
      description: '설명',
    })
  })

  it('시스템 기본 창고: 설명·정렬순서·비고만 고치고 나머지는 그대로', async () => {
    const inbound = await systemOf(f.icn, 'INBOUND')
    const result = await update(inbound.id, {
      name: '바꾸려는 이름',
      type: 'STORAGE',
      allocatable: true,
      description: '입고 확정 재고가 머무는 곳',
      sortOrder: 7,
      remark: '메모',
    })
    expect(result.ok).toBe(true)
    const saved = await prisma.warehouse.findUniqueOrThrow({ where: { id: inbound.id } })
    expect(saved).toMatchObject({
      name: '입고대기',
      type: 'INBOUND',
      allocatableYn: 'N',
      description: '입고 확정 재고가 머무는 곳',
      sortOrder: 7,
      remark: '메모',
    })
  })

  it('재고가 있으면 유형·온도대를 바꿀 수 없다 (다른 칸은 고칠 수 있다)', async () => {
    const gen = await genWarehouse()
    await stockUp()
    expect(await update(gen.id, { code: 'GEN', type: 'QC' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('창고 유형') },
    })
    await prisma.centerTempZone.create({ data: { centerId: f.icn, tempZoneCd: 'CHILLED' } })
    expect(await update(gen.id, { tempZone: 'CHILLED' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('온도대') },
    })
    expect((await update(gen.id, { name: 'GEN 이름만' })).ok).toBe(true)
  })

  it('기본 로케이션은 이 창고의 사용 중인 로케이션만', async () => {
    const gen = await genWarehouse()
    expect((await update(gen.id, { defaultLocId: String(f.a01) })).ok).toBe(true)
    // 다른 센터 창고의 로케이션
    expect(await update(gen.id, { defaultLocId: String(f.b01) })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })
})

describe('사용 중지 · 삭제 · 되살리기', () => {
  it('사용 중지: 시스템 기본 창고·재고 있는 창고는 거부 (하나라도 섞이면 전체 거부)', async () => {
    const a = await create()
    const inbound = await systemOf(f.icn, 'INBOUND')
    expect(
      await setWarehousesActiveAction({ ids: [a.id, String(inbound.id)], isActive: false }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })

    const gen = await genWarehouse()
    await stockUp()
    expect(
      await setWarehousesActiveAction({ ids: [String(gen.id)], isActive: false }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('재고') },
    })

    expect(await setWarehousesActiveAction({ ids: [a.id], isActive: false })).toEqual({
      ok: true,
      data: { count: 1 },
    })
    expect(await setWarehousesActiveAction({ ids: [a.id], isActive: true })).toEqual({
      ok: true,
      data: { count: 1 },
    })
  })

  it('삭제: 로케이션·재고 기록이 없는 창고만, 시스템 기본 창고 불가. 되살리기', async () => {
    const a = await create()
    const gen = await genWarehouse()
    const inbound = await systemOf(f.icn, 'INBOUND')
    // GEN은 로케이션이 있다
    expect(await deleteWarehousesAction({ ids: [String(gen.id)] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('GEN') },
    })
    expect(await deleteWarehousesAction({ ids: [String(inbound.id)] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await deleteWarehousesAction({ ids: [a.id] })).toEqual({
      ok: true,
      data: { deleted: 1 },
    })
    // 지운 코드는 다시 쓸 수 있고, 그러면 되살리기는 거부
    const again = await create()
    expect(await restoreWarehousesAction({ ids: [a.id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect((await deleteWarehousesAction({ ids: [again.id] })).ok).toBe(true)
    expect((await restoreWarehousesAction({ ids: [a.id] })).ok).toBe(true)
  })
})

describe('목록 · 데이터 범위 · 권한', () => {
  const codes = async (filters: Record<string, string>) => {
    const result = await listWarehousesAction({ ...createDataGridState(), filters })
    return result.ok ? result.data.rows.map((r) => r.code) : result.error
  }

  it('기본 순서: 센터 → 창고 정렬순서(기본 창고 입고·출고·반품 먼저) → 코드', async () => {
    await create({ code: 'B01', sortOrder: 20 })
    await create({ code: 'A01', sortOrder: 20 })
    expect(await codes({ center: String(f.icn) })).toEqual([
      'INBOUND',
      'OUTBOUND',
      'RETURN',
      'GEN',
      'A01',
      'B01',
    ])
  })

  it('유형·온도대·할당 가능·상태·삭제됨으로 거른다 (모르는 값은 조건 없음)', async () => {
    await prisma.centerTempZone.create({ data: { centerId: f.icn, tempZoneCd: 'FROZEN' } })
    await create({ code: 'F01', tempZone: 'FROZEN', type: 'DAMAGED', allocatable: false })
    const icn = { center: String(f.icn) }
    expect(await codes({ ...icn, type: 'INBOUND,RETURN' })).toEqual(['INBOUND', 'RETURN'])
    expect(await codes({ ...icn, tempZone: 'FROZEN' })).toEqual(['F01'])
    expect(await codes({ ...icn, allocatable: 'Y' })).toEqual(['GEN'])
    expect((await codes({ ...icn, type: 'HOT' })) as string[]).toHaveLength(5)
    expect(await codes({ ...icn, status: 'INACTIVE' })).toEqual([])
    const f01 = await prisma.warehouse.findFirstOrThrow({ where: { code: 'F01' } })
    await deleteWarehousesAction({ ids: [String(f01.id)] })
    expect(await codes({ ...icn, status: 'DELETED' })).toEqual(['F01'])
  })

  it('목록 줄: 기본 창고 표시·할당 가능·로케이션 수', async () => {
    const result = await listWarehousesAction({
      ...createDataGridState(),
      filters: { center: String(f.icn) },
    })
    expect(result.ok && result.data.rows.slice(0, 1)).toEqual([
      expect.objectContaining({
        code: 'INBOUND',
        isSystem: true,
        allocatable: false,
        locationCount: 1,
      }),
    ])
    expect(result.ok && result.data.rows.find((r) => r.code === 'GEN')).toMatchObject({
      isSystem: false,
      allocatable: true,
      locationCount: 2,
    })
  })

  it('센터 직원: 소속 센터 창고만 보고, 다른 센터 창고는 고치거나 추가할 수 없다', async () => {
    const gmhWarehouse = await create({ centerId: String(f.gmh), code: 'B01' })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.icn] })

    const result = await listWarehousesAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual([
      'INBOUND',
      'OUTBOUND',
      'RETURN',
      'GEN',
    ])
    expect(await codes({ center: String(f.gmh) })).toEqual([])
    expect(await update(gmhWarehouse.id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await createWarehouseAction(input({ centerId: String(f.gmh) }))).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await deleteWarehousesAction({ ids: [gmhWarehouse.id] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    // 자기 센터에는 추가할 수 있다 (권한이 있으면)
    expect((await createWarehouseAction(input({ code: 'A09' }))).ok).toBe(true)
  })

  it('권한: 조회만 있으면 등록·수정·삭제 불가, 엑셀 전체는 엑셀 권한 필요', async () => {
    signIn({ kind: 'ALL', operatorId: TEST_OPERATOR_ID }, ['master.warehouses.read'])
    expect(await createWarehouseAction(input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    const gen = await genWarehouse()
    expect(await deleteWarehousesAction({ ids: [String(gen.id)] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(await listWarehousesAction({ ...createDataGridState(), exportAll: true })).toMatchObject(
      { ok: false, error: { code: 'FORBIDDEN' } },
    )
  })
})

describe('구역 표 (창고 수정과 함께 저장, 0075)', () => {
  const zone = (overrides: Record<string, string> = {}) => ({
    id: '',
    code: 'a',
    name: 'A구역',
    type: 'STORAGE',
    pickSeq: '',
    sortOrder: '10',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    ...overrides,
  })
  const saveZones = async (warehouseId: bigint, zones: ReturnType<typeof zone>[]) =>
    updateWarehouseAction({
      id: String(warehouseId),
      rowVersion: await versionOf('warehouse', warehouseId),
      ...updateInput({ code: 'GEN', name: 'GEN' }),
      zones,
    })

  beforeEach(async () => {
    await createTestCodeGroup('ZONE_TYPE', [{ code: 'STORAGE' }, { code: 'PICKING' }])
  })

  it('새 줄은 만들고(코드 대문자, 센터 키) 줄 키를 돌려준다, 저장된 구역의 코드는 바꿀 수 없다', async () => {
    const gen = await genWarehouse()
    const result = await saveZones(gen.id, [
      zone(),
      zone({ code: 'p1', name: '피킹', type: 'PICKING', pickSeq: '1' }),
    ])
    if (!result.ok) throw new Error(result.error.message)
    expect(result.data.zoneIds).toHaveLength(2)
    const saved = await prisma.zone.findMany({
      where: { warehouseId: gen.id },
      orderBy: { code: 'asc' },
    })
    expect(saved.map((z) => [z.code, z.type, z.pickSeq, z.centerId])).toEqual([
      ['A', 'STORAGE', null, f.icn],
      ['P1', 'PICKING', 1, f.icn],
    ])
    const [aId, pId] = result.data.zoneIds!
    expect(
      await saveZones(gen.id, [zone({ id: aId, code: 'B' }), zone({ id: pId, code: 'P1' })]),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('바꿀 수 없습니다') },
    })
    // 표 안에서 같은 코드
    expect(await saveZones(gen.id, [zone(), zone()])).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })

  it('로케이션이 있는 구역은 지울 수 없고, 재고가 있는 구역은 사용 중지할 수 없다', async () => {
    const gen = await genWarehouse()
    const result = await saveZones(gen.id, [zone()])
    if (!result.ok) throw new Error(result.error.message)
    const zoneId = result.data.zoneIds![0]
    await prisma.location.update({ where: { id: f.a01 }, data: { zoneId: BigInt(zoneId) } })

    expect(await saveZones(gen.id, [])).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('로케이션이 있는 구역') },
    })
    await stockUp()
    expect(
      await saveZones(gen.id, [zone({ id: zoneId, code: 'A', status: 'INACTIVE' })]),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('재고') },
    })
  })

  it('시스템 기본 창고는 구역 표를 받지 않는다 (보내도 무시)', async () => {
    const inbound = await systemOf(f.icn, 'INBOUND')
    const result = await updateWarehouseAction({
      id: String(inbound.id),
      rowVersion: await versionOf('warehouse', inbound.id),
      ...updateInput(),
      zones: [zone()],
    })
    expect(result.ok).toBe(true)
    expect(await prisma.zone.count({ where: { warehouseId: inbound.id } })).toBe(0)
  })
})
