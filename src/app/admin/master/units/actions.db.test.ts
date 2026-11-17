import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import type { UnitCreateInput } from '@/lib/units/unit-schema'
import { systemUnit, versionOf } from '@/test/factories'
import { createInboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createUnitAction,
  deleteUnitsAction,
  listUnitsAction,
  restoreUnitsAction,
  setUnitsActiveAction,
  updateUnitAction,
} from './actions'

// 단위 기준정보 (docs/decisions/0034·0078): 시스템 기본 단위(공유·보호) + 운영사 추가 단위

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })),
}))

const CODES: PermissionCode[] = [
  'master.units.read',
  'master.units.create',
  'master.units.update',
  'master.units.delete',
]

function signIn(codes = CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
}

// 운영사 추가 단위 '근' (중량, 1 근 = 0.6 KG)
const input = (overrides: Partial<UnitCreateInput> = {}): UnitCreateInput => ({
  code: 'gn',
  name: '근',
  nameEn: 'Geun',
  printName: '',
  type: 'WEIGHT',
  decimals: 3,
  sortOrder: 900,
  baseFactor: '0.6',
  stdCode: '',
  description: '',
  remark: '',
  isActive: true,
  ...overrides,
})

async function create(overrides: Partial<UnitCreateInput> = {}) {
  const result = await createUnitAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// 수정: 코드는 보내도 버려진다 (수정 입력 규칙에 코드 칸이 없다)
const update = async (id: string, overrides: Partial<UnitCreateInput> = {}) =>
  updateUnitAction({ id, rowVersion: await versionOf('unit', id), ...input(overrides) })

const codesOf = async (filters: Record<string, string> = {}) => {
  const result = await listUnitsAction({ ...createDataGridState({ pageSize: 100 }), filters })
  return result.ok ? result.data.rows.map((r) => r.code) : result.error
}

beforeEach(async () => {
  await resetDatabase()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('시스템 기본 단위 (마이그레이션 시드)', () => {
  it('20개, 유형별 기준단위 하나, 물리 단위는 기준단위 × 환산계수, 포장 단위는 환산계수 없음', async () => {
    const units = await prisma.unit.findMany({
      where: { operatorId: null },
      include: { baseUnit: { select: { code: true } } },
    })
    expect(units).toHaveLength(20)
    expect(
      units
        .filter((u) => u.isBase === 'Y')
        .map((u) => u.code)
        .sort(),
    ).toEqual(['EA', 'KG', 'L', 'M', 'M2'])
    const of = (code: string) => units.find((u) => u.code === code)!
    expect(of('LB')).toMatchObject({ type: 'WEIGHT', stdCode: 'LBR' })
    expect(of('LB').baseUnit?.code).toBe('KG')
    expect(of('LB').baseFactor?.toString()).toBe('0.45359237')
    expect(of('INCH').baseUnit?.code).toBe('M')
    expect(of('PLT')).toMatchObject({ type: 'PACK', baseFactor: null, stdCode: 'XPX' })
    expect(of('SET')).toMatchObject({ type: 'QTY', baseFactor: null })
  })
})

describe('단위 추가 · 수정', () => {
  it('코드는 대문자, 시스템 코드·내 코드와 겹치면 거부, 기준단위는 유형에서 자동', async () => {
    const gn = await create()
    expect(gn.code).toBe('GN')
    const saved = await prisma.unit.findUniqueOrThrow({
      where: { id: BigInt(gn.id) },
      include: { baseUnit: { select: { code: true } } },
    })
    expect(saved).toMatchObject({ operatorId: TEST_OPERATOR_ID, isSystem: 'N', type: 'WEIGHT' })
    expect(saved.baseUnit?.code).toBe('KG')

    expect(await createUnitAction(input({ code: 'KG' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('시스템 기본 단위') },
    })
    expect(await createUnitAction(input())).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('이미 있는') },
    })
  })

  it('물리 단위는 환산계수 필수, 포장·수량 단위는 환산계수를 버린다', async () => {
    expect(await createUnitAction(input({ code: 'DON', baseFactor: '' }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { baseFactor: [expect.stringContaining('환산계수')] } },
    })
    const cs = await create({ code: 'CS', name: '케이스', type: 'PACK', decimals: 0 })
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(cs.id) } })).toMatchObject({
      baseFactor: null,
      baseUnitId: null,
    })
    expect(await createUnitAction(input({ code: '1A', decimals: 9 }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: [expect.any(String)], decimals: [expect.any(String)] } },
    })
  })

  it('수정: 코드·유형은 그대로, 시스템 기본 단위는 거부', async () => {
    const gn = await create()
    expect(await update(gn.id, { name: '근(600g)', decimals: 2 })).toMatchObject({ ok: true })
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(gn.id) } })).toMatchObject({
      code: 'GN',
      name: '근(600g)',
      decimals: 2,
    })
    expect(await update(gn.id, { type: 'VOLUME' })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('유형') },
    })

    const ea = await systemUnit('EA')
    expect(
      await update(String(ea.id), { type: 'QTY', name: '낱개', baseFactor: '' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect((await systemUnit('EA')).name).toBe('개')
  })

  it('환산계수 변경은 기록하고, 쓰는 곳이 있으면 알린다 / 소수 자리수는 더 많은 자리의 수량이 있으면 줄일 수 없다', async () => {
    const gn = await create()
    const ids = await createInboundFixture()
    const item = await prisma.item.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        shipperId: ids.gana,
        systemCode: 'IT-T-GN',
        code: 'HERB',
        name: '약초',
        baseUnitId: BigInt(gn.id),
      },
    })
    // 재고 변경은 운영사 출입증 안에서 (0039)
    await runInContext({ actor: 'test', operatorId: TEST_OPERATOR_ID }, () =>
      stockTransaction((tx) =>
        receiveStock(tx, { address: { locationId: ids.icnStaging, itemId: item.id }, qty: '1.25' }),
      ),
    )

    const changed = await update(gn.id, { baseFactor: '0.600' })
    // 같은 값(끝의 0만 다름)은 바뀐 것이 아니다
    expect(changed).toMatchObject({ ok: true, data: { notice: undefined } })
    const factor = await update(gn.id, { baseFactor: '0.5' })
    expect(factor).toMatchObject({
      ok: true,
      data: { notice: expect.stringContaining('품목 기본단위 1건') },
    })
    const saved = await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(gn.id) } })
    expect(saved.baseFactor?.toString()).toBe('0.5')
    expect(saved.extAttr).toMatchObject({
      baseFactorHistory: [{ by: 'boss', from: '0.6', to: '0.5' }],
    })

    // 재고 1.25 → 소수 1자리로는 못 줄이고, 2자리는 된다
    expect(await update(gn.id, { baseFactor: '0.5', decimals: 1 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('재고 1건') },
    })
    expect(await update(gn.id, { baseFactor: '0.5', decimals: 2 })).toMatchObject({ ok: true })
  })
})

describe('목록 · 일괄 처리 · 권한', () => {
  it('시스템 + 내 단위가 보이고, 유형(여러 개)·시스템 여부로 거르고, 기본 정렬은 유형 → 정렬순서', async () => {
    await create()
    const all = await codesOf()
    expect(Array.isArray(all) && all.length).toBe(21)
    expect(Array.isArray(all) && all.slice(0, 3)).toEqual(['EA', 'SET', 'PAIR'])

    expect(await codesOf({ type: 'WEIGHT' })).toEqual(['KG', 'G', 'TON', 'LB', 'GN'])
    expect(await codesOf({ type: 'AREA,PACK' })).toEqual(['BOX', 'PACK', 'BAG', 'BDL', 'PLT', 'M2'])
    expect(await codesOf({ system: 'N' })).toEqual(['GN'])
  })

  it('일괄 사용 중지·삭제: 시스템 단위가 섞이면 전체 거부, 삭제하면 외부 코드도 지운다', async () => {
    const gn = await create()
    // 외부 코드는 외부코드 매핑 메뉴에서 넣는다 (0068) — 단위를 지우면 함께 지운다
    await prisma.externalCode.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        system: 'SAP',
        entityType: 'UNIT',
        entityId: BigInt(gn.id),
        code: 'GN1',
      },
    })
    const plt = await systemUnit('PLT')
    expect(
      await setUnitsActiveAction({ ids: [gn.id, String(plt.id)], isActive: false }),
    ).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', message: expect.stringContaining('PLT') },
    })
    expect(await deleteUnitsAction({ ids: [String(plt.id)] })).toMatchObject({ ok: false })
    expect(await setUnitsActiveAction({ ids: [gn.id], isActive: false })).toMatchObject({
      ok: true,
      data: { count: 1 },
    })
    expect(await deleteUnitsAction({ ids: [gn.id] })).toEqual({ ok: true, data: { count: 1 } })
    expect(await prisma.externalCode.count()).toBe(0)
  })

  it('권한이 없으면 거부', async () => {
    signIn(['master.units.read'])
    expect(await createUnitAction(input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})

describe('논리 삭제 · 되살리기 (0038)', () => {
  it('지우면 목록에서 빠지고 "삭제됨"에서만 보이며, 같은 코드를 새로 만들 수 있다', async () => {
    const gn = await create()
    expect(await deleteUnitsAction({ ids: [gn.id] })).toMatchObject({
      ok: true,
      data: { count: 1 },
    })

    expect(await codesOf({ system: 'N' })).toEqual([])
    expect(await codesOf({ status: 'DELETED' })).toEqual(['GN'])
    expect(await prisma.unit.count({ where: { delYn: 'Y' } })).toBe(1)
    expect(await createUnitAction(input({ name: '새 근' }))).toMatchObject({ ok: true })
  })

  it('되살리기: 같은 코드가 다시 쓰이고 있으면 거부, 비어 있으면 지우기 전 상태로 돌아온다', async () => {
    const first = await create({ isActive: false })
    await deleteUnitsAction({ ids: [first.id] })
    const second = await create()

    expect(await restoreUnitsAction({ ids: [first.id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('GN') },
    })
    await deleteUnitsAction({ ids: [second.id] })
    expect(await restoreUnitsAction({ ids: [first.id] })).toMatchObject({
      ok: true,
      data: { count: 1 },
    })
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(first.id) } })).toMatchObject({
      code: 'GN',
      status: 'INACTIVE',
      delYn: 'N',
    })
  })

  it('되살리기는 삭제 권한이 있어야 한다', async () => {
    const gn = await create()
    await deleteUnitsAction({ ids: [gn.id] })
    signIn(CODES.filter((c) => c !== 'master.units.delete'))
    expect(await restoreUnitsAction({ ids: [gn.id] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
