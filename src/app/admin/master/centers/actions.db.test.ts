import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import type { CenterInput } from '@/lib/centers/center-schema'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { resetDatabase } from '@/test/reset-database'
import {
  createCenterAction,
  listCentersAction,
  setCenterActiveAction,
  updateCenterAction,
} from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL_CODES: PermissionCode[] = [
  'master.centers.read',
  'master.centers.create',
  'master.centers.update',
]

function signIn(scope: DataScope = { kind: 'ALL' }, codes = ALL_CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 'u1',
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

const input = (overrides: Partial<CenterInput> = {}): CenterInput => ({
  code: '',
  name: '이천센터',
  phone: '031-123-4567',
  fax: '',
  managerName: '김센터',
  managerPhone: '010-1111-2222',
  zipCode: '',
  address: '',
  addressDetail: '',
  externalCodes: { SAP: '', ERP: '' },
  ...overrides,
})

async function create(overrides: Partial<CenterInput> = {}) {
  const result = await createCenterAction(input(overrides))
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

describe('센터 등록', () => {
  it('시스템 코드 자동 부여, 코드를 비우면 시스템 코드로, 입고대기 창고·기본 로케이션 함께 생성', async () => {
    const center = await create()

    expect(center.systemCode).toMatch(/^CT\d{6}$/)
    expect(center.code).toBe(center.systemCode)
    const warehouses = await prisma.warehouse.findMany({
      where: { centerId: center.id },
      include: { locations: true },
    })
    expect(warehouses.map((w) => [w.code, w.type, w.locations.map((l) => l.code)])).toEqual([
      ['INBOUND', 'INBOUND_STAGING', ['DEFAULT']],
    ])
  })

  it('사용자 코드는 대문자로 저장, 외부 코드도 함께 저장', async () => {
    const center = await create({ code: 'icn-1', externalCodes: { SAP: '1000', ERP: '' } })
    expect(center.code).toBe('ICN-1')
    expect(await getExternalCodes('CENTER', center.id)).toEqual({ SAP: '1000', ERP: '' })
  })

  it('코드 규칙: 중복 거부, 시스템 코드 모양 거부, 형식 오류는 칸별 오류', async () => {
    await create({ code: 'ICN' })
    expect(await createCenterAction(input({ code: 'icn' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('ICN') },
    })
    expect(await createCenterAction(input({ code: 'CT000999' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('시스템 코드 모양') },
    })
    expect(await createCenterAction(input({ code: '한글', name: '' }))).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { code: [expect.any(String)], name: [expect.any(String)] },
      },
    })
  })

  it('외부 코드가 다른 센터와 겹치면 전체를 취소한다 (센터·창고가 남지 않음)', async () => {
    await create({ code: 'ICN', externalCodes: { SAP: '1000', ERP: '' } })
    const before = {
      centers: await prisma.center.count(),
      warehouses: await prisma.warehouse.count(),
    }

    expect(
      await createCenterAction(input({ code: 'GMH', externalCodes: { SAP: '1000', ERP: '' } })),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('SAP') },
    })

    expect(await prisma.center.count()).toBe(before.centers)
    expect(await prisma.warehouse.count()).toBe(before.warehouses)
  })
})

describe('센터 수정', () => {
  it('정보·코드·외부 코드를 고치고, 코드를 비우면 시스템 코드로 돌아간다 (시스템 코드는 그대로)', async () => {
    const center = await create({ code: 'ICN', externalCodes: { SAP: '1000', ERP: '' } })

    expect(
      await updateCenterAction({
        id: center.id,
        ...input({ code: 'ICN2', name: '이천2센터', externalCodes: { SAP: '', ERP: 'E-ICN' } }),
      }),
    ).toMatchObject({ ok: true })
    let saved = await prisma.center.findUniqueOrThrow({ where: { id: center.id } })
    expect(saved).toMatchObject({ code: 'ICN2', name: '이천2센터', systemCode: center.systemCode })
    expect(await getExternalCodes('CENTER', center.id)).toEqual({ SAP: '', ERP: 'E-ICN' })

    await updateCenterAction({ id: center.id, ...input({ code: '' }) })
    saved = await prisma.center.findUniqueOrThrow({ where: { id: center.id } })
    expect(saved.code).toBe(center.systemCode)
  })

  it('다른 센터의 코드는 쓸 수 없다', async () => {
    await create({ code: 'ICN' })
    const other = await create({ code: 'GMH' })
    expect(await updateCenterAction({ id: other.id, ...input({ code: 'ICN' }) })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })

  it('사용 중지 / 다시 사용', async () => {
    const center = await create()
    await setCenterActiveAction({ id: center.id, isActive: false })
    expect((await prisma.center.findUniqueOrThrow({ where: { id: center.id } })).isActive).toBe(
      false,
    )
    await setCenterActiveAction({ id: center.id, isActive: true })
    expect((await prisma.center.findUniqueOrThrow({ where: { id: center.id } })).isActive).toBe(
      true,
    )
  })
})

describe('목록 · 데이터 범위 · 권한', () => {
  it('목록: 시스템 코드로도 찾고, 창고 수를 함께 준다', async () => {
    const icn = await create({ code: 'ICN' })
    await create({ code: 'GMH', name: '김해센터' })

    const result = await listCentersAction(createDataGridState({ search: icn.systemCode }))
    expect(result.ok && result.data.rows).toEqual([
      expect.objectContaining({ code: 'ICN', warehouseCount: 1 }),
    ])
  })

  it('센터 직원: 소속 센터만 보이고, 다른 센터는 고칠 수 없다 (존재도 알려주지 않음)', async () => {
    const icn = await create({ code: 'ICN' })
    const gmh = await create({ code: 'GMH', name: '김해센터' })
    signIn({ kind: 'CENTERS', centerIds: [icn.id] })

    const result = await listCentersAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['ICN'])

    expect(await updateCenterAction({ id: gmh.id, ...input({ code: 'GMH' }) })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await updateCenterAction({ id: icn.id, ...input({ code: 'ICN' }) })).toMatchObject({
      ok: true,
    })
  })

  it('센터 직원은 권한 코드가 있어도 등록·사용 중지는 못 한다 (운영사만)', async () => {
    const icn = await create({ code: 'ICN' })
    signIn({ kind: 'CENTERS', centerIds: [icn.id] })

    expect(await createCenterAction(input({ code: 'NEW' }))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(await setCenterActiveAction({ id: icn.id, isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })

  it('권한이 없으면 거부 (조회만 있으면 등록·수정 불가)', async () => {
    signIn({ kind: 'ALL' }, ['master.centers.read'])
    expect(await createCenterAction(input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
