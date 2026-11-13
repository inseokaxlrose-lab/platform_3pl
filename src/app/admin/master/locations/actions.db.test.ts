import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import {
  bulkCreateLocationsAction,
  createLocationAction,
  deleteLocationsAction,
  listLocationsAction,
  previewBulkLocationsAction,
  setLocationsActiveAction,
} from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const CODES: PermissionCode[] = [
  'master.locations.read',
  'master.locations.create',
  'master.locations.update',
  'master.locations.delete',
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
let icnWarehouseId = '' // 이천 일반 창고
let gmhWarehouseId = '' // 김해 일반 창고
let icnStagingId = '' // 이천 입고대기 창고

const RANGE = {
  zoneFrom: 'A',
  zoneTo: 'B',
  aisleFrom: 1,
  aisleTo: 2,
  aisleDigits: 2,
  levelFrom: 1,
  levelTo: 3,
  levelDigits: 2,
  separator: '-' as const,
}

async function generalWarehouse(centerId: string, code: string) {
  const w = await prisma.warehouse.create({
    data: { centerId, systemCode: await nextSystemCode('WAREHOUSE'), code, name: code },
  })
  return w.id
}

const codesOf = async (warehouseId: string) =>
  (await prisma.location.findMany({ where: { warehouseId }, orderBy: { code: 'asc' } })).map(
    (l) => l.code,
  )

beforeEach(async () => {
  await resetDatabase()
  icnId = (await createTestCenter('ICN')).id
  gmhId = (await createTestCenter('GMH')).id
  icnStagingId = (await ensureCenterDefaults(prisma, icnId)).id
  await ensureCenterDefaults(prisma, gmhId)
  icnWarehouseId = await generalWarehouse(icnId, 'A')
  gmhWarehouseId = await generalWarehouse(gmhId, 'A')
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('한 칸 등록', () => {
  it('대문자로 저장하고, 같은 창고의 같은 코드는 거부 (다른 창고는 허용)', async () => {
    expect(await createLocationAction({ warehouseId: icnWarehouseId, code: 'x-01' })).toMatchObject(
      {
        ok: true,
        data: { code: 'X-01' },
      },
    )
    expect(await createLocationAction({ warehouseId: icnWarehouseId, code: 'X-01' })).toMatchObject(
      {
        ok: false,
        error: { code: 'CONFLICT' },
      },
    )
    expect((await createLocationAction({ warehouseId: gmhWarehouseId, code: 'X-01' })).ok).toBe(
      true,
    )
  })

  it('입고대기 창고·사용 중지된 창고에는 추가할 수 없다', async () => {
    expect(await createLocationAction({ warehouseId: icnStagingId, code: 'S-01' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('입고대기') },
    })
    await prisma.warehouse.update({ where: { id: icnWarehouseId }, data: { isActive: false } })
    expect(await createLocationAction({ warehouseId: icnWarehouseId, code: 'S-01' })).toMatchObject(
      {
        ok: false,
        error: { code: 'CONFLICT', message: expect.stringContaining('사용 중지') },
      },
    )
  })
})

describe('일괄 생성', () => {
  it('미리보기는 만들지 않고 개수·처음·마지막을 알려준다', async () => {
    const preview = await previewBulkLocationsAction({ warehouseId: icnWarehouseId, range: RANGE })
    expect(preview).toEqual({
      ok: true,
      data: {
        total: 12,
        skipped: 0,
        toCreate: 12,
        first: ['A-01-01', 'A-01-02', 'A-01-03', 'A-02-01', 'A-02-02'],
        last: ['B-02-01', 'B-02-02', 'B-02-03'],
      },
    })
    expect(await prisma.location.count({ where: { warehouseId: icnWarehouseId } })).toBe(0)
  })

  it('없는 코드만 만들고 구역·열·단을 함께 저장, 다시 실행하면 전부 건너뛴다', async () => {
    await createLocationAction({ warehouseId: icnWarehouseId, code: 'A-01-02' })

    expect(await bulkCreateLocationsAction({ warehouseId: icnWarehouseId, range: RANGE })).toEqual({
      ok: true,
      data: { created: 11, skipped: 1 },
    })
    const located = await prisma.location.findUniqueOrThrow({
      where: { warehouseId_code: { warehouseId: icnWarehouseId, code: 'B-02-03' } },
    })
    expect(located).toMatchObject({ zone: 'B', aisle: '02', level: '03' })

    expect(await bulkCreateLocationsAction({ warehouseId: icnWarehouseId, range: RANGE })).toEqual({
      ok: true,
      data: { created: 0, skipped: 12 },
    })
    expect(await codesOf(icnWarehouseId)).toHaveLength(12)
  })

  it('범위 규칙 위반·입고대기 창고는 거부', async () => {
    expect(
      await bulkCreateLocationsAction({
        warehouseId: icnWarehouseId,
        range: { ...RANGE, zoneTo: 'Z', aisleTo: 99, levelTo: 9 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(
      await bulkCreateLocationsAction({ warehouseId: icnStagingId, range: RANGE }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})

describe('사용 중지 · 삭제 (여러 개)', () => {
  it('골라서 사용 중지 / 다시 사용, 삭제', async () => {
    await bulkCreateLocationsAction({ warehouseId: icnWarehouseId, range: RANGE })
    const ids = (
      await prisma.location.findMany({ where: { warehouseId: icnWarehouseId, zone: 'A' } })
    ).map((l) => l.id)

    expect(await setLocationsActiveAction({ ids, isActive: false })).toEqual({
      ok: true,
      data: { updated: 6 },
    })
    expect(
      await prisma.location.count({ where: { warehouseId: icnWarehouseId, isActive: false } }),
    ).toBe(6)

    expect(await deleteLocationsAction({ ids })).toEqual({ ok: true, data: { deleted: 6 } })
    expect(await codesOf(icnWarehouseId)).toHaveLength(6)
  })

  it('입고대기 창고의 기본 로케이션은 사용 중지·삭제할 수 없다 (섞여 있으면 전체 거부)', async () => {
    const defaultLocation = await prisma.location.findFirstOrThrow({
      where: { warehouseId: icnStagingId },
    })
    const normal = await createLocationAction({ warehouseId: icnWarehouseId, code: 'N-01' })
    const ids = [defaultLocation.id, normal.ok ? normal.data.id : '']

    expect(await setLocationsActiveAction({ ids, isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('기본 로케이션') },
    })
    expect(await deleteLocationsAction({ ids })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await prisma.location.count({ where: { isActive: false } })).toBe(0)
    expect(await prisma.location.count({ where: { id: { in: ids } } })).toBe(2)
  })
})

describe('목록 · 데이터 범위 · 권한', () => {
  it('창고·구역 거르기, 기본 정렬은 센터 → 창고 → 코드, 구역 목록', async () => {
    await bulkCreateLocationsAction({ warehouseId: icnWarehouseId, range: RANGE })

    const result = await listLocationsAction({
      ...createDataGridState({ pageSize: 50 }),
      warehouseId: icnWarehouseId,
      zone: 'B',
    })
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual([
      'B-01-01',
      'B-01-02',
      'B-01-03',
      'B-02-01',
      'B-02-02',
      'B-02-03',
    ])
    expect(result.ok && result.data.zones).toEqual(['A', 'B'])

    const all = await listLocationsAction(createDataGridState({ pageSize: 50 }))
    expect(all.ok && all.data.rows.filter((r) => r.protected).map((r) => r.code)).toEqual([
      'DEFAULT',
      'DEFAULT',
    ])
  })

  it('센터 직원: 소속 센터 로케이션만, 다른 센터 창고·로케이션은 다룰 수 없다', async () => {
    const gmhLocation = await createLocationAction({ warehouseId: gmhWarehouseId, code: 'G-01' })
    const gmhLocationId = gmhLocation.ok ? gmhLocation.data.id : ''
    signIn({ kind: 'CENTERS', centerIds: [icnId] })

    const result = await listLocationsAction(createDataGridState({ pageSize: 50 }))
    expect(result.ok && new Set(result.data.rows.map((r) => r.center))).toEqual(
      new Set(['ICN 센터 (ICN)']),
    )

    expect(await createLocationAction({ warehouseId: gmhWarehouseId, code: 'X' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await setLocationsActiveAction({ ids: [gmhLocationId], isActive: false })).toMatchObject(
      {
        ok: false,
        error: { code: 'NOT_FOUND' },
      },
    )
    expect(await deleteLocationsAction({ ids: [gmhLocationId] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('조회 권한만 있으면 등록·수정·삭제 불가', async () => {
    signIn({ kind: 'ALL' }, ['master.locations.read'])
    expect(await createLocationAction({ warehouseId: icnWarehouseId, code: 'X' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(await deleteLocationsAction({ ids: ['x'] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
