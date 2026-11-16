import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { ensureCenterDefaults } from '@/lib/centers/center-defaults'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, versionOf } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  bulkCreateLocationsAction,
  commitLocationUploadAction,
  createLocationAction,
  deleteLocationsAction,
  listLocationsAction,
  previewBulkLocationsAction,
  setLocationsActiveAction,
  updateLocationAction,
  validateLocationUploadAction,
} from './actions'
import { getWarehouseOptions } from './queries'

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

let icnId = 0n
let gmhId = 0n
let icnWarehouseId = 0n // 이천 일반 창고
let gmhWarehouseId = 0n // 김해 일반 창고
let icnStagingId = 0n // 이천 입고대기 창고

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

async function generalWarehouse(centerId: bigint, code: string) {
  const w = await prisma.warehouse.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      centerId,
      systemCode: await nextSystemCode('WAREHOUSE'),
      code,
      name: code,
    },
  })
  return w.id
}

const codesOf = async (warehouseId: bigint) =>
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
    expect(
      await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'x-01' }),
    ).toMatchObject({
      ok: true,
      data: { code: 'X-01' },
    })
    expect(
      await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'X-01' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(
      (await createLocationAction({ warehouseId: String(gmhWarehouseId), code: 'X-01' })).ok,
    ).toBe(true)
  })

  it('입고대기 창고·사용 중지된 창고에는 추가할 수 없다', async () => {
    expect(
      await createLocationAction({ warehouseId: String(icnStagingId), code: 'S-01' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('입고대기') },
    })
    await prisma.warehouse.update({ where: { id: icnWarehouseId }, data: { status: 'INACTIVE' } })
    expect(
      await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'S-01' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('사용 중지') },
    })
  })
})

describe('명칭·비고 (0071)', () => {
  it('명칭을 비우면 코드와 같게, 넣으면 그대로 (한글 가능) · 비고는 선택', async () => {
    const a = await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'f1-07' })
    const b = await createLocationAction({
      warehouseId: String(icnWarehouseId),
      code: 'DOCK-01',
      name: ' 1번 도크 ',
      remark: '냉동실 입구 옆',
    })
    expect(a.ok && b.ok).toBe(true)
    const rows = await prisma.location.findMany({
      where: { warehouseId: icnWarehouseId, code: { in: ['F1-07', 'DOCK-01'] } },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, remark: true },
    })
    expect(rows).toEqual([
      { code: 'DOCK-01', name: '1번 도크', remark: '냉동실 입구 옆' },
      { code: 'F1-07', name: 'F1-07', remark: null },
    ])

    // 목록 검색어로 명칭도 찾는다
    const found = await listLocationsAction({ ...createDataGridState(), search: '도크' })
    expect(found.ok && found.data.rows.map((r) => r.code)).toEqual(['DOCK-01'])
  })

  it('명칭·비고 수정: 비우면 명칭은 코드로, 버전이 다르면 거부, 범위 밖은 찾을 수 없음', async () => {
    const created = await createLocationAction({
      warehouseId: String(icnWarehouseId),
      code: 'R-01',
      name: '랙1',
    })
    if (!created.ok) throw new Error(created.error.message)
    const id = created.data.id
    const version = await versionOf('location', id)

    expect(
      await updateLocationAction({ id, rowVersion: version, name: '', remark: '수리 중' }),
    ).toMatchObject({ ok: true })
    expect(
      await prisma.location.findUniqueOrThrow({
        where: { id: BigInt(id) },
        select: { name: true, remark: true },
      }),
    ).toEqual({ name: 'R-01', remark: '수리 중' })

    // 예전 버전으로 다시 저장 → 다른 사람이 먼저 고친 것으로 보고 거부
    expect(
      await updateLocationAction({ id, rowVersion: version, name: 'X', remark: '' }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })

    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [] })
    expect(
      await updateLocationAction({
        id,
        rowVersion: await versionOf('location', id),
        name: 'X',
        remark: '',
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })
})

describe('일괄 생성', () => {
  it('미리보기는 만들지 않고 개수·처음·마지막을 알려준다', async () => {
    const preview = await previewBulkLocationsAction({
      warehouseId: String(icnWarehouseId),
      range: RANGE,
    })
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

  it('없는 코드만 만들고 구역·열·단을 함께 저장(명칭 = 코드), 다시 실행하면 전부 건너뛴다', async () => {
    await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'A-01-02' })

    expect(
      await bulkCreateLocationsAction({ warehouseId: String(icnWarehouseId), range: RANGE }),
    ).toEqual({
      ok: true,
      data: { created: 11, skipped: 1 },
    })
    const located = await prisma.location.findUniqueOrThrow({
      where: { warehouseId_code: { warehouseId: icnWarehouseId, code: 'B-02-03' } },
    })
    expect(located).toMatchObject({ zone: 'B', aisle: '02', level: '03', name: 'B-02-03' })

    expect(
      await bulkCreateLocationsAction({ warehouseId: String(icnWarehouseId), range: RANGE }),
    ).toEqual({
      ok: true,
      data: { created: 0, skipped: 12 },
    })
    expect(await codesOf(icnWarehouseId)).toHaveLength(12)
  })

  it('범위 규칙 위반·입고대기 창고는 거부', async () => {
    expect(
      await bulkCreateLocationsAction({
        warehouseId: String(icnWarehouseId),
        range: { ...RANGE, zoneTo: 'Z', aisleTo: 99, levelTo: 9 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(
      await bulkCreateLocationsAction({ warehouseId: String(icnStagingId), range: RANGE }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})

describe('사용 중지 · 삭제 (여러 개)', () => {
  it('골라서 사용 중지 / 다시 사용, 삭제', async () => {
    await bulkCreateLocationsAction({ warehouseId: String(icnWarehouseId), range: RANGE })
    const ids = (
      await prisma.location.findMany({ where: { warehouseId: icnWarehouseId, zone: 'A' } })
    ).map((l) => l.id)

    expect(await setLocationsActiveAction({ ids: ids.map(String), isActive: false })).toEqual({
      ok: true,
      data: { updated: 6 },
    })
    expect(
      await prisma.location.count({ where: { warehouseId: icnWarehouseId, status: 'INACTIVE' } }),
    ).toBe(6)

    expect(await deleteLocationsAction({ ids: ids.map(String) })).toEqual({
      ok: true,
      data: { deleted: 6 },
    })
    expect(await codesOf(icnWarehouseId)).toHaveLength(6)
  })

  it('입고대기 창고의 기본 로케이션은 사용 중지·삭제할 수 없다 (섞여 있으면 전체 거부)', async () => {
    const defaultLocation = await prisma.location.findFirstOrThrow({
      where: { warehouseId: icnStagingId },
    })
    const normal = await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'N-01' })
    const ids = [String(defaultLocation.id), normal.ok ? normal.data.id : '']

    expect(await setLocationsActiveAction({ ids, isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('기본 로케이션') },
    })
    expect(await deleteLocationsAction({ ids })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await prisma.location.count({ where: { status: 'INACTIVE' } })).toBe(0)
    expect(await prisma.location.count({ where: { id: { in: ids.map(BigInt) } } })).toBe(2)
  })
})

describe('목록 · 데이터 범위 · 권한', () => {
  it('창고·구역 거르기, 기본 정렬은 센터 → 창고 → 코드, 구역 목록', async () => {
    await bulkCreateLocationsAction({ warehouseId: String(icnWarehouseId), range: RANGE })

    const result = await listLocationsAction({
      ...createDataGridState({ pageSize: 50 }),
      filters: { warehouse: String(icnWarehouseId), zone: 'B' },
    })
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual([
      'B-01-01',
      'B-01-02',
      'B-01-03',
      'B-02-01',
      'B-02-02',
      'B-02-03',
    ])
    // 구역 선택지: 창고마다 그 창고의 구역
    const options = await getWarehouseOptions({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
    expect(options.find((w) => w.id === String(icnWarehouseId))?.zones).toEqual(['A', 'B'])
    // 상태 거르기
    const inactive = await listLocationsAction({
      ...createDataGridState(),
      filters: { warehouse: String(icnWarehouseId), status: 'INACTIVE' },
    })
    expect(inactive.ok && inactive.data.rowCount).toBe(0)

    const all = await listLocationsAction(createDataGridState({ pageSize: 50 }))
    expect(all.ok && all.data.rows.filter((r) => r.protected).map((r) => r.code)).toEqual([
      'DEFAULT',
      'DEFAULT',
    ])
  })

  it('센터 직원: 소속 센터 로케이션만, 다른 센터 창고·로케이션은 다룰 수 없다', async () => {
    const gmhLocation = await createLocationAction({
      warehouseId: String(gmhWarehouseId),
      code: 'G-01',
    })
    const gmhLocationId = gmhLocation.ok ? gmhLocation.data.id : ''
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [icnId] })

    const result = await listLocationsAction(createDataGridState({ pageSize: 50 }))
    expect(result.ok && new Set(result.data.rows.map((r) => r.center))).toEqual(
      new Set(['ICN 센터 (ICN)']),
    )

    expect(
      await createLocationAction({ warehouseId: String(gmhWarehouseId), code: 'X' }),
    ).toMatchObject({
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
    signIn({ kind: 'ALL', operatorId: TEST_OPERATOR_ID }, ['master.locations.read'])
    expect(
      await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'X' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(await deleteLocationsAction({ ids: ['999999'] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})

describe('엑셀', () => {
  it('엑셀 전체 읽기는 엑셀 권한이 필요하다', async () => {
    expect(await listLocationsAction({ ...createDataGridState(), exportAll: true })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})

describe('엑셀 일괄 업로드 (0071)', () => {
  // 엑셀 한 줄 (행 번호는 머리글 다음부터)
  const row = (rowNo: number, values: Record<string, string>) => ({
    rowNo,
    values: { centerCode: 'icn', warehouseCode: 'a', ...values },
  })

  it('미리보기는 저장하지 않고, 등록하면 명칭(비우면 코드)·구역·열·단·비고를 저장, 이미 있는 코드는 건너뛴다', async () => {
    await createLocationAction({ warehouseId: String(icnWarehouseId), code: 'DOCK-01' })
    const rows = [
      row(2, { code: 'f1-rack-07', name: '냉동실 입구 옆', zone: 'f', aisle: '07', level: '3' }),
      row(3, { code: 'DOCK-01' }),
      row(4, { code: 'DOCK-02', remark: '2번 도크' }),
    ]

    const preview = await validateLocationUploadAction(rows)
    expect(preview).toMatchObject({
      ok: true,
      data: { errorCount: 0, summary: expect.stringContaining('새로 2개') },
    })
    expect(await codesOf(icnWarehouseId)).toEqual(['DOCK-01'])

    expect(await commitLocationUploadAction(rows)).toMatchObject({
      ok: true,
      data: { created: 2, skipped: 1 },
    })
    const saved = await prisma.location.findMany({
      where: { warehouseId: icnWarehouseId },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, zone: true, aisle: true, level: true, remark: true },
    })
    expect(saved).toEqual([
      { code: 'DOCK-01', name: 'DOCK-01', zone: null, aisle: null, level: null, remark: null },
      {
        code: 'DOCK-02',
        name: 'DOCK-02',
        zone: null,
        aisle: null,
        level: null,
        remark: '2번 도크',
      },
      {
        code: 'F1-RACK-07',
        name: '냉동실 입구 옆',
        zone: 'F',
        aisle: '07',
        level: '3',
        remark: null,
      },
    ])
  })

  it('줄마다 오류: 없는 센터·창고, 입고대기 창고, 코드·구역·열·단 규칙, 파일 안 중복 → 하나라도 있으면 등록 거부', async () => {
    const rows = [
      row(2, { centerCode: 'XXX', code: 'A-1' }),
      row(3, { warehouseCode: 'NOPE', code: 'A-1' }),
      row(4, { warehouseCode: 'INBOUND', code: 'A-1' }),
      row(5, { code: '가-01' }),
      row(6, { code: 'B-1', zone: 'A1', aisle: 'x', level: '1234' }),
      row(7, { code: 'C-1' }),
      row(8, { code: 'c-1' }),
      row(9, { code: '' }),
    ]
    const preview = await validateLocationUploadAction(rows)
    if (!preview.ok) throw new Error(preview.error.message)
    const errorsOf = (rowNo: number) =>
      preview.data.rows.find((r) => r.rowNo === rowNo)?.errors.join(' / ') ?? ''
    expect(errorsOf(2)).toContain('센터')
    expect(errorsOf(3)).toContain('없는 창고')
    expect(errorsOf(4)).toContain('입고대기')
    expect(errorsOf(5)).toContain('영문·숫자·하이픈')
    expect(errorsOf(6)).toMatch(/구역.*열.*단/)
    expect(errorsOf(7)).toBe('')
    expect(errorsOf(8)).toContain('같은 창고·같은 코드')
    expect(errorsOf(9)).not.toBe('')

    expect(await commitLocationUploadAction(rows)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await codesOf(icnWarehouseId)).toEqual([])
  })

  it('데이터 범위: 센터 직원은 소속 센터 창고에만 올릴 수 있다', async () => {
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [gmhId] })
    const preview = await validateLocationUploadAction([row(2, { code: 'A-1' })])
    expect(preview.ok && preview.data.errorCount).toBe(1)
  })
})
