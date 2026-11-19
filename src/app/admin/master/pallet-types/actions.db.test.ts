import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { runInContext } from '@/lib/actor'
import { getPalletSpec } from '@/lib/pallets/pallet-types'
import type { PalletTypeCreateInput } from '@/lib/pallets/pallet-type-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { versionOf } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createPalletTypeAction,
  deletePalletTypeAction,
  listPalletTypesAction,
  setDefaultPalletTypeAction,
  updatePalletTypeAction,
} from './actions'

// 팔레트 종류 (docs/decisions/0083): 시스템 기본(T11·T12) + 운영사 행, 같은 코드는 운영사 행이 덮어쓴다

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

function signIn(
  operatorId = TEST_OPERATOR_ID,
  codes: PermissionCode[] = [...ALL_PERMISSION_CODES],
) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue({ kind: 'ALL', operatorId } satisfies DataScope)
}

const input = (overrides: Partial<PalletTypeCreateInput> = {}): PalletTypeCreateInput => ({
  code: 'EUR',
  name: '유로 팔레트',
  widthCm: '120',
  depthCm: '80',
  heightCm: '14.4',
  weightKg: '25',
  maxLoadHeightCm: '180',
  maxLoadWeightKg: '1500',
  status: 'ACTIVE',
  sortOrder: 30,
  remark: '',
  ...overrides,
})

// 목록 [코드, 출처, 가로, 기본 여부]
const listRows = async () => {
  const result = await listPalletTypesAction(createDataGridState())
  return result.ok
    ? result.data.rows.map((r) => [r.code, r.source, r.widthCm, r.isDefault])
    : result
}

const spec = (operatorId: bigint, code: string) =>
  runInContext({ actor: 'test', operatorId }, () => getPalletSpec(prisma, operatorId, code))

beforeEach(async () => {
  await resetDatabase()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('팔레트 종류', () => {
  it('시스템 기본 T11·T12가 보이고, 운영사 기본은 T11', async () => {
    expect(await listRows()).toEqual([
      ['T11', 'SYSTEM', '110', true],
      ['T12', 'SYSTEM', '120', false],
    ])
    expect(await spec(TEST_OPERATOR_ID, 'T11')).toMatchObject({
      heightCm: '15',
      weightKg: '25',
      maxLoadHeightCm: '180',
      maxLoadWeightKg: '1000',
    })
  })

  it('운영사 팔레트를 더하고, 같은 코드는 운영사 안에서 겹칠 수 없다 (코드는 대문자로)', async () => {
    expect(await createPalletTypeAction(input({ code: 'eur' }))).toMatchObject({
      ok: true,
      data: { code: 'EUR' },
    })
    expect(await createPalletTypeAction(input())).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await listRows()).toContainEqual(['EUR', 'OPERATOR', '120', false])
    // 권장 적재 높이는 팔레트 높이보다 커야 한다
    expect(
      await createPalletTypeAction(input({ code: 'LOW', maxLoadHeightCm: '10' })),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })

  it('시스템 기본은 직접 고치거나 지울 수 없고, 같은 코드로 등록하면 이 운영사 값으로 덮어쓴다 — 지우면 시스템 값으로 돌아간다', async () => {
    const t11 = await prisma.palletType.findFirstOrThrow({
      where: { code: 'T11', operatorId: null },
    })
    expect(
      await updatePalletTypeAction({
        ...input({ name: '바꿈' }),
        id: String(t11.id),
        rowVersion: t11.rowVersion,
      }),
    ).toMatchObject({ ok: false })
    expect(await deletePalletTypeAction({ id: String(t11.id) })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })

    const own = await createPalletTypeAction(
      input({ code: 'T11', name: '우리 T11', widthCm: '111', sortOrder: 0 }),
    )
    expect(await listRows()).toEqual([
      ['T11', 'OVERRIDE', '111', true],
      ['T12', 'SYSTEM', '120', false],
    ])
    expect((await spec(TEST_OPERATOR_ID, 'T11'))?.widthCm).toBe('111')

    // 덮어쓴 행은 기본 팔레트여도 지울 수 있다 (시스템 행이 남아 있으므로)
    const id = own.ok ? String(own.data.id) : ''
    expect(await deletePalletTypeAction({ id })).toMatchObject({ ok: true })
    expect((await spec(TEST_OPERATOR_ID, 'T11'))?.widthCm).toBe('110')
  })

  it('운영사 행 수정은 버전 검사, 운영사 기본으로 정한 운영사 전용 팔레트는 지울 수 없다', async () => {
    const created = await createPalletTypeAction(input())
    const id = created.ok ? String(created.data.id) : ''
    expect(
      await updatePalletTypeAction({
        ...input({ name: '유로 EPAL' }),
        id,
        rowVersion: await versionOf('palletType', id),
      }),
    ).toMatchObject({ ok: true })
    expect(await updatePalletTypeAction({ ...input(), id, rowVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })

    expect(await setDefaultPalletTypeAction({ code: 'eur' })).toMatchObject({
      ok: true,
      data: { code: 'EUR' },
    })
    expect(await deletePalletTypeAction({ id })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('기본 팔레트') },
    })
    // 없는·사용 중지 종류는 기본으로 정할 수 없다
    expect(await setDefaultPalletTypeAction({ code: 'NOPE' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    await setDefaultPalletTypeAction({ code: 'T12' })
    expect(await deletePalletTypeAction({ id })).toMatchObject({ ok: true })
  })

  it('다른 운영사의 팔레트는 보이지 않고, 권한은 단위 관리(master.units)와 같다', async () => {
    await createPalletTypeAction(input())
    const other = await createTestOperator('다른운영사')
    signIn(other.id)
    expect((await listRows()) as unknown[]).toEqual([
      ['T11', 'SYSTEM', '110', true],
      ['T12', 'SYSTEM', '120', false],
    ])
    expect(await spec(other.id, 'EUR')).toBeNull()

    signIn(TEST_OPERATOR_ID, ['master.units.read'])
    expect(await createPalletTypeAction(input({ code: 'NEW' }))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
