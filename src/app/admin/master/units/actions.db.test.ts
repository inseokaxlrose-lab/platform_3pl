import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import { versionOf } from '@/test/factories'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import type { UnitCreateInput } from '@/lib/units/unit-schema'
import { resetDatabase } from '@/test/reset-database'
import {
  createUnitAction,
  deleteUnitsAction,
  listUnitsAction,
  restoreUnitsAction,
  setUnitsActiveAction,
  updateUnitAction,
} from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL' })),
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
  vi.mocked(getCurrentScope).mockResolvedValue({ kind: 'ALL' })
}

const input = (overrides: Partial<UnitCreateInput> = {}): UnitCreateInput => ({
  code: 'kg',
  name: '킬로그램',
  kind: 'BASE',
  decimals: 3,
  sortOrder: 10,
  isActive: true,
  externalCodes: { SAP: '', ERP: '' },
  ...overrides,
})

async function create(overrides: Partial<UnitCreateInput> = {}) {
  const result = await createUnitAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('단위 등록·수정', () => {
  it('코드는 대문자로, 중복 거부, 환산단위는 소수 자리수 0, 외부 코드 함께 저장', async () => {
    const kg = await create({ externalCodes: { SAP: 'KGM', ERP: '' } })
    expect(kg.code).toBe('KG')
    expect(await getExternalCodes('UNIT', BigInt(kg.id))).toEqual({ SAP: 'KGM', ERP: '' })
    expect(await createUnitAction(input({ code: 'KG' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    const box = await create({ code: 'BOX', name: '박스', kind: 'PACK', decimals: 2 })
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(box.id) } })).decimals).toBe(
      0,
    )
    expect(await createUnitAction(input({ code: '1A', decimals: 9 }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: [expect.any(String)], decimals: [expect.any(String)] } },
    })
  })

  it('수정: 코드는 그대로, 시스템 단위는 종류 변경·사용 중지 불가', async () => {
    const kg = await create()
    await updateUnitAction({
      id: kg.id,
      rowVersion: await versionOf('unit', kg.id),
      ...input({ code: 'XX', name: '킬로', decimals: 2 }),
    })
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(kg.id) } })).toMatchObject({
      code: 'KG',
      name: '킬로',
      decimals: 2,
    })

    const ea = await prisma.unit.create({
      data: { code: 'EA', name: '개', kind: 'BASE', isSystem: 'Y' },
    })
    expect(
      await updateUnitAction({
        id: String(ea.id),
        rowVersion: await versionOf('unit', String(ea.id)),
        ...input({ name: '개', kind: 'PACK', decimals: 0 }),
      }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('종류') } })
    expect(
      await updateUnitAction({
        id: String(ea.id),
        rowVersion: await versionOf('unit', String(ea.id)),
        ...input({ name: '개', decimals: 0, isActive: false }),
      }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('사용 중지') } })
  })
})

describe('목록 · 일괄 처리 · 권한', () => {
  it('종류·상태로 거르고, 기본 정렬은 기본단위 → 환산단위, 외부 코드를 함께 준다', async () => {
    await create({ code: 'BOX', name: '박스', kind: 'PACK', sortOrder: 1 })
    await create({ code: 'KG', sortOrder: 5, externalCodes: { SAP: 'KGM', ERP: '' } })
    await create({ code: 'EA', name: '개', decimals: 0, sortOrder: 1 })

    const all = await listUnitsAction(createDataGridState())
    expect(all.ok && all.data.rows.map((u) => u.code)).toEqual(['EA', 'KG', 'BOX'])
    expect(all.ok && all.data.rows[1].externalCodes).toEqual({ SAP: 'KGM', ERP: '' })

    const pack = await listUnitsAction({ ...createDataGridState(), filters: { kind: 'PACK' } })
    expect(pack.ok && pack.data.rows.map((u) => u.code)).toEqual(['BOX'])
  })

  it('일괄 사용 중지·삭제: 시스템 단위가 섞이면 전체 거부, 삭제하면 외부 코드도 지운다', async () => {
    const kg = await create({ externalCodes: { SAP: 'KGM', ERP: '' } })
    const plt = await prisma.unit.create({
      data: { code: 'PLT', name: '팔레트', kind: 'PACK', isSystem: 'Y' },
    })
    expect(
      await setUnitsActiveAction({ ids: [kg.id, String(plt.id)], isActive: false }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('PLT') },
    })
    expect(await deleteUnitsAction({ ids: [String(plt.id)] })).toMatchObject({ ok: false })
    expect(await setUnitsActiveAction({ ids: [kg.id], isActive: false })).toEqual({
      ok: true,
      data: { count: 1 },
    })
    expect(await deleteUnitsAction({ ids: [kg.id] })).toEqual({ ok: true, data: { count: 1 } })
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
  const codesOf = async (status?: string) => {
    const result = await listUnitsAction({
      ...createDataGridState({ pageSize: 50 }),
      filters: status ? { status } : {},
    })
    return result.ok ? result.data.rows.map((r) => r.code) : result.error
  }

  it('지우면 목록에서 빠지고 "삭제됨"에서만 보이며, 같은 코드를 새로 만들 수 있다', async () => {
    const created = await createUnitAction(input({ code: 'KG' }))
    const id = created.ok ? created.data.id : ''
    expect(await deleteUnitsAction({ ids: [id] })).toMatchObject({ ok: true, data: { count: 1 } })

    expect(await codesOf()).toEqual([])
    expect(await codesOf('DELETED')).toEqual(['KG'])
    // DB에는 남아 있다 (del_yn 'Y')
    expect(await prisma.unit.count({ where: { delYn: 'Y' } })).toBe(1)
    // 지운 코드는 다시 쓸 수 있다
    expect(await createUnitAction(input({ code: 'KG', name: '새 킬로그램' }))).toMatchObject({
      ok: true,
    })
  })

  it('되살리기: 같은 코드가 다시 쓰이고 있으면 거부, 비어 있으면 지우기 전 상태로 돌아온다', async () => {
    const first = await createUnitAction(input({ code: 'KG', isActive: false }))
    const oldId = first.ok ? first.data.id : ''
    await deleteUnitsAction({ ids: [oldId] })
    const second = await createUnitAction(input({ code: 'KG' }))
    const newId = second.ok ? second.data.id : ''

    expect(await restoreUnitsAction({ ids: [oldId] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('KG') },
    })
    // 새로 만든 것을 지우면 옛 것을 되살릴 수 있다
    await deleteUnitsAction({ ids: [newId] })
    expect(await restoreUnitsAction({ ids: [oldId] })).toMatchObject({
      ok: true,
      data: { count: 1 },
    })
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(oldId) } })).toMatchObject({
      code: 'KG',
      status: 'INACTIVE',
      delYn: 'N',
    })
    // 지우지 않은 것·없는 것은 되살릴 수 없다
    expect(await restoreUnitsAction({ ids: [oldId] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('되살리기는 삭제 권한이 있어야 한다', async () => {
    const created = await createUnitAction(input({ code: 'KG' }))
    const id = created.ok ? created.data.id : ''
    await deleteUnitsAction({ ids: [id] })
    signIn(CODES.filter((c) => c !== 'master.units.delete'))
    expect(await restoreUnitsAction({ ids: [id] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
