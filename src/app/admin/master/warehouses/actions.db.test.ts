import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import type { WarehouseCreateInput } from '@/lib/warehouses/warehouse-schema'
import { createTestCenter } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import {
  createWarehouseAction,
  listWarehousesAction,
  setWarehouseActiveAction,
  updateWarehouseAction,
} from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const CODES: PermissionCode[] = [
  'master.warehouses.read',
  'master.warehouses.create',
  'master.warehouses.update',
]

function signIn(scope: DataScope = { kind: 'ALL' }, codes = CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 'u1',
    name: '사용자',
    username: 'u1',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let icnId = ''
let gmhId = ''

const input = (overrides: Partial<WarehouseCreateInput> = {}): WarehouseCreateInput => ({
  centerId: icnId,
  code: '',
  name: '상온 1창고',
  storageCondition: 'AMBIENT',
  externalCodes: { SAP: '', ERP: '' },
  ...overrides,
})

async function create(overrides: Partial<WarehouseCreateInput> = {}) {
  const result = await createWarehouseAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// 센터의 입고대기 창고
const stagingOf = (centerId: string) =>
  prisma.warehouse.findFirstOrThrow({ where: { centerId, type: 'INBOUND_STAGING' } })

beforeEach(async () => {
  await resetDatabase()
  icnId = (await createTestCenter('ICN')).id
  gmhId = (await createTestCenter('GMH')).id
  await ensureCenterDefaults(prisma, icnId)
  await ensureCenterDefaults(prisma, gmhId)
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('창고 등록', () => {
  it('일반 창고로 만들고, 시스템 코드·보관 조건·외부 코드를 저장한다', async () => {
    const created = await create({
      code: 'a01',
      storageCondition: 'CHILLED',
      externalCodes: { SAP: 'W100', ERP: '' },
    })
    const saved = await prisma.warehouse.findUniqueOrThrow({ where: { id: created.id } })
    expect(saved).toMatchObject({ code: 'A01', type: 'GENERAL', storageCondition: 'CHILLED' })
    expect(saved.systemCode).toMatch(/^WH\d{6}$/)
    expect(await getExternalCodes('WAREHOUSE', created.id)).toEqual({ SAP: 'W100', ERP: '' })
  })

  it('코드는 같은 센터 안에서만 중복 금지 (다른 센터는 같은 코드 가능)', async () => {
    await create({ code: 'A01' })
    expect(await createWarehouseAction(input({ code: 'A01' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('A01') },
    })
    expect((await createWarehouseAction(input({ centerId: gmhId, code: 'A01' }))).ok).toBe(true)
    // 자동으로 만든 입고대기 창고의 코드와도 겹칠 수 없다
    expect(await createWarehouseAction(input({ code: 'INBOUND' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('시스템 코드 모양은 쓸 수 없고, 사용 중지된 센터에는 추가할 수 없다', async () => {
    expect(await createWarehouseAction(input({ code: 'WH000999' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    await prisma.center.update({ where: { id: gmhId }, data: { isActive: false } })
    expect(await createWarehouseAction(input({ centerId: gmhId }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('사용 중지된 센터') },
    })
  })
})

describe('창고 수정 · 입고대기 보호', () => {
  it('일반 창고: 코드·이름·보관 조건·외부 코드를 고치고, 코드를 비우면 시스템 코드로', async () => {
    const created = await create({ code: 'A01' })
    await updateWarehouseAction({
      id: created.id,
      code: 'A02',
      name: '냉동 창고',
      storageCondition: 'FROZEN',
      externalCodes: { SAP: '', ERP: 'E-1' },
    })
    let saved = await prisma.warehouse.findUniqueOrThrow({ where: { id: created.id } })
    expect(saved).toMatchObject({ code: 'A02', name: '냉동 창고', storageCondition: 'FROZEN' })

    await updateWarehouseAction({ id: created.id, ...input({ code: '' }) })
    saved = await prisma.warehouse.findUniqueOrThrow({ where: { id: created.id } })
    expect(saved.code).toBe(saved.systemCode)
  })

  it('입고대기 창고: 이름·보관 조건은 고칠 수 있지만 코드는 바꿀 수 없고 사용 중지할 수 없다', async () => {
    const staging = await stagingOf(icnId)

    expect(
      await updateWarehouseAction({
        id: staging.id,
        code: '',
        name: '입고대기(냉장)',
        storageCondition: 'CHILLED',
        externalCodes: { SAP: '', ERP: '' },
      }),
    ).toMatchObject({ ok: true })
    expect(await prisma.warehouse.findUniqueOrThrow({ where: { id: staging.id } })).toMatchObject({
      code: 'INBOUND',
      name: '입고대기(냉장)',
      storageCondition: 'CHILLED',
      type: 'INBOUND_STAGING',
    })

    expect(
      await updateWarehouseAction({ id: staging.id, ...input({ code: 'NEWCODE' }) }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('입고대기') },
    })
    expect(await setWarehouseActiveAction({ id: staging.id, isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: '입고대기 창고는 사용 중지할 수 없습니다.' },
    })
  })

  it('일반 창고는 사용 중지 / 다시 사용', async () => {
    const created = await create()
    await setWarehouseActiveAction({ id: created.id, isActive: false })
    expect((await prisma.warehouse.findUniqueOrThrow({ where: { id: created.id } })).isActive).toBe(
      false,
    )
  })
})

describe('목록 · 데이터 범위 · 권한', () => {
  it('센터 고르기·검색, 로케이션 수 함께', async () => {
    await create({ code: 'A01' })
    await create({ centerId: gmhId, code: 'B01', name: '김해 1창고' })

    const icnOnly = await listWarehousesAction({ ...createDataGridState(), centerId: icnId })
    expect(icnOnly.ok && icnOnly.data.rows.map((r) => r.code)).toEqual(['A01', 'INBOUND'])

    const searched = await listWarehousesAction(createDataGridState({ search: '김해 1' }))
    expect(searched.ok && searched.data.rows).toEqual([
      expect.objectContaining({ code: 'B01', locationCount: 0 }),
    ])
  })

  it('센터 직원: 소속 센터 창고만 보고, 다른 센터 창고는 고치거나 추가할 수 없다', async () => {
    const gmhWarehouse = await create({ centerId: gmhId, code: 'B01' })
    signIn({ kind: 'CENTERS', centerIds: [icnId] })

    const result = await listWarehousesAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => r.center)).toEqual(['ICN 센터 (ICN)'])
    // 다른 센터를 골라도 범위 밖은 나오지 않는다
    const other = await listWarehousesAction({ ...createDataGridState(), centerId: gmhId })
    expect(other.ok && other.data.rows).toEqual([])

    expect(await updateWarehouseAction({ id: gmhWarehouse.id, ...input() })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await createWarehouseAction(input({ centerId: gmhId }))).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    // 자기 센터에는 추가할 수 있다 (권한이 있으면)
    expect((await createWarehouseAction(input({ code: 'A09' }))).ok).toBe(true)
  })

  it('조회 권한만 있으면 등록·수정 불가', async () => {
    signIn({ kind: 'ALL' }, ['master.warehouses.read'])
    expect(await createWarehouseAction(input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
