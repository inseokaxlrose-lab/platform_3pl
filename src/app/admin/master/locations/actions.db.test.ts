import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { runInContext } from '@/lib/actor'
import { isLocationUsable } from '@/lib/locations/location-usable'
import type { LocationBulkInput, LocationCreateInput } from '@/lib/locations/location-schema'
import { DEFAULT_BULK_ATTRIBUTES } from '@/lib/locations/location-schema'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { getEffectiveLocationOps } from '@/lib/settings/effective-setting'
import { receiveStock } from '@/lib/stock/stock-change'
import { stockTransaction } from '@/lib/stock/stock-transaction'
import { createTestCodeGroup, versionOf } from '@/test/factories'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  bulkCreateLocationsAction,
  commitLocationUploadAction,
  createLocationAction,
  deleteLocationsAction,
  listLocationsAction,
  previewBulkLocationsAction,
  restoreLocationsAction,
  setLocationsActiveAction,
  updateLocationAction,
  validateLocationUploadAction,
} from './actions'

// 로케이션 서버 액션 (docs/decisions/0028, 0071, 0075)

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

let f: InboundFixture
let gen: bigint // 이천 GEN 창고 (A-01·A-02)
let zoneA: bigint // GEN 창고 A구역
let gmhGen: bigint // 김해 GMHGEN 창고

const ids = (list: (bigint | string)[]) => list.map(String)

// 한 칸 추가 입력 (기본값 + 바꿀 것)
const input = (overrides: Partial<LocationCreateInput> = {}): LocationCreateInput => ({
  warehouseId: String(gen),
  code: 'R-01-01',
  zoneId: '',
  description: '',
  locType: 'RACK',
  remark: '',
  rowNo: '',
  levelNo: '',
  widthCm: '',
  depthCm: '',
  heightCm: '',
  maxCbm: '',
  maxWeightKg: '',
  maxPalletCnt: null,
  inbound: null,
  outbound: null,
  allocatable: null,
  mixItem: true,
  mixLot: true,
  mixClient: false,
  putawaySeq: null,
  pickSeq: null,
  ...overrides,
})

// 일괄 생성 입력: A구역 열 1~2 × 단 1~3 = 6개
const bulk = (overrides: Partial<LocationBulkInput['pattern']> = {}): LocationBulkInput => ({
  warehouseId: String(gen),
  zoneId: String(zoneA),
  pattern: {
    zoneCode: '',
    pattern: '{ZONE}-{ROW}-{LEVEL}',
    row: { from: 1, to: 2, digits: 2 },
    level: { from: 1, to: 3, digits: 2 },
    bay: null,
    cell: null,
    ...overrides,
  },
  attributes: { ...DEFAULT_BULK_ATTRIBUTES, locType: 'FLOOR', mixClient: true },
})

const codesOf = async (warehouseId: bigint) =>
  (await prisma.location.findMany({ where: { warehouseId }, orderBy: { code: 'asc' } })).map(
    (l) => l.code,
  )

// A-01에 재고 넣기
const stockUp = (locationId = f.a01) =>
  runInContext({ actor: 'kim', operatorId: TEST_OPERATOR_ID }, () =>
    stockTransaction((tx) =>
      receiveStock(tx, { address: { locationId, itemId: f.water }, qty: '10' }),
    ),
  )

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  await createTestCodeGroup('LOC_TYPE', [{ code: 'RACK' }, { code: 'FLOOR' }, { code: 'STAGING' }])
  await createTestCodeGroup('LOCK_REASON', [{ code: 'COUNT' }])
  gen = (await prisma.warehouse.findFirstOrThrow({ where: { code: 'GEN' } })).id
  gmhGen = (await prisma.warehouse.findFirstOrThrow({ where: { code: 'GMHGEN' } })).id
  zoneA = (
    await prisma.zone.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        centerId: f.icn,
        warehouseId: gen,
        code: 'A',
        name: 'A구역',
      },
    })
  ).id
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('한 칸 추가 · 수정', () => {
  it('코드는 대문자로, 센터 키는 창고의 센터, 용량·운영 속성 저장 (상속 칸은 비워 둠)', async () => {
    const result = await createLocationAction(
      input({
        code: 'a-09-01',
        zoneId: String(zoneA),
        rowNo: '09',
        levelNo: '01',
        description: '입구 옆',
        widthCm: '120',
        depthCm: '100',
        heightCm: '150',
        maxCbm: '1.8',
        maxWeightKg: '1000',
        allocatable: false,
      }),
    )
    expect(result.ok).toBe(true)
    const saved = await prisma.location.findFirstOrThrow({ where: { code: 'A-09-01' } })
    expect(saved).toMatchObject({
      centerId: f.icn,
      zoneId: zoneA,
      rowNo: '09',
      levelNo: '01',
      description: '입구 옆',
      locType: 'RACK',
      inboundYn: null,
      allocatableYn: 'N',
      mixClientYn: 'N',
      systemYn: 'N',
    })
    expect(saved.maxCbm?.toString()).toBe('1.8')
    // 실제 적용값: 적치는 창고 값(가능), 할당은 로케이션 값(불가)
    expect(await getEffectiveLocationOps(saved.id)).toMatchObject({
      inbound: { value: true, source: 'WAREHOUSE' },
      allocatable: { value: false, source: 'LOCATION' },
    })
  })

  it('거부: 같은 창고에 있는 코드, 다른 창고의 구역, 시스템 기본 창고, 없는 유형 코드', async () => {
    expect(await createLocationAction(input({ code: 'A-01' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    // 다른 창고에는 같은 코드 가능 (중복 금지는 창고 단위)
    expect(
      (await createLocationAction(input({ warehouseId: String(gmhGen), code: 'A-01' }))).ok,
    ).toBe(true)
    expect(
      await createLocationAction(
        input({ warehouseId: String(gmhGen), code: 'Z-1', zoneId: String(zoneA) }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('같은 창고') },
    })
    const inbound = await prisma.warehouse.findFirstOrThrow({
      where: { centerId: f.icn, type: 'INBOUND', systemYn: 'Y' },
    })
    expect(await createLocationAction(input({ warehouseId: String(inbound.id) }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('시스템 기본 창고') },
    })
    expect(await createLocationAction(input({ locType: 'HOT' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })

  it('수정: 코드는 그대로, 시스템 기본 로케이션은 설명·비고만, 잠그면 사유 필수', async () => {
    const a01 = await prisma.location.findUniqueOrThrow({ where: { id: f.a01 } })
    const { warehouseId, code, ...rest } = input({
      description: '바뀐 설명',
      zoneId: String(zoneA),
    })
    void warehouseId
    void code
    const result = await updateLocationAction({
      id: String(a01.id),
      rowVersion: await versionOf('location', a01.id),
      ...rest,
    })
    expect(result.ok).toBe(true)
    expect(await prisma.location.findUniqueOrThrow({ where: { id: a01.id } })).toMatchObject({
      code: 'A-01',
      description: '바뀐 설명',
      zoneId: zoneA,
    })

    // 2차 칸: 잠그면 사유 필수, 사유를 주면 잠금 일시를 남긴다
    expect(
      await updateLocationAction({
        id: String(a01.id),
        rowVersion: await versionOf('location', a01.id),
        ...rest,
        lock: true,
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(
      (
        await updateLocationAction({
          id: String(a01.id),
          rowVersion: await versionOf('location', a01.id),
          ...rest,
          lock: true,
          lockReason: 'COUNT',
        })
      ).ok,
    ).toBe(true)
    const locked = await prisma.location.findUniqueOrThrow({ where: { id: a01.id } })
    expect(locked).toMatchObject({ lockYn: 'Y', lockReason: 'COUNT' })
    expect(locked.lockAt).not.toBeNull()

    // 시스템 기본 로케이션
    const system = await prisma.location.findFirstOrThrow({
      where: { centerId: f.icn, systemYn: 'Y' },
    })
    await updateLocationAction({
      id: String(system.id),
      rowVersion: await versionOf('location', system.id),
      ...rest,
      locType: 'RACK',
      mixClient: true,
      description: '입고 확정 재고',
    })
    expect(await prisma.location.findUniqueOrThrow({ where: { id: system.id } })).toMatchObject({
      locType: 'STAGING',
      mixClientYn: 'N',
      description: '입고 확정 재고',
    })
  })
})

describe('일괄 생성', () => {
  it('패턴으로 만들고 이미 있는 코드는 건너뛴다 (미리보기 → 생성), 공통 속성·열·단 저장', async () => {
    await createLocationAction(input({ code: 'A-01-02' }))
    const preview = await previewBulkLocationsAction(bulk())
    expect(preview).toEqual({
      ok: true,
      data: {
        total: 6,
        skipped: 1,
        toCreate: 5,
        first: ['A-01-01', 'A-01-03', 'A-02-01', 'A-02-02', 'A-02-03'],
        last: [],
      },
    })
    expect(await bulkCreateLocationsAction(bulk())).toMatchObject({
      ok: true,
      data: { created: 5, skipped: 1 },
    })
    const made = await prisma.location.findFirstOrThrow({ where: { code: 'A-02-03' } })
    expect(made).toMatchObject({
      zoneId: zoneA,
      centerId: f.icn,
      rowNo: '02',
      levelNo: '03',
      locType: 'FLOOR',
      mixClientYn: 'Y',
    })
    // 같은 범위를 다시 실행해도 안전
    expect(await bulkCreateLocationsAction(bulk())).toMatchObject({
      ok: true,
      data: { created: 0, skipped: 6 },
    })
  })

  it('연 사용·구분자 없음 패턴, 다른 창고의 구역·범위 초과·패턴 오류는 거부', async () => {
    const result = await bulkCreateLocationsAction(
      bulk({
        pattern: '{ZONE}{ROW}{BAY}{LEVEL}',
        row: { from: 1, to: 1, digits: 2 },
        bay: { from: 1, to: 2, digits: 1 },
        level: { from: 1, to: 1, digits: 1 },
      }),
    )
    expect(result).toMatchObject({ ok: true, data: { created: 2 } })
    expect(await prisma.location.findFirst({ where: { code: 'A0121' } })).toMatchObject({
      bayNo: '2',
    })

    expect(
      await bulkCreateLocationsAction({ ...bulk(), warehouseId: String(gmhGen) }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(
      await previewBulkLocationsAction(
        bulk({ row: { from: 1, to: 100, digits: 3 }, level: { from: 1, to: 60, digits: 2 } }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    // 단 범위가 있는데 패턴에 {LEVEL}이 없으면 코드가 겹친다
    expect(await previewBulkLocationsAction(bulk({ pattern: '{ZONE}-{ROW}' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
  })
})

describe('사용 중지 · 삭제 · 되살리기', () => {
  it('재고가 있으면 사용 중지 불가, 재고 기록이 있으면 삭제 불가, 시스템 기본 로케이션은 둘 다 불가', async () => {
    await stockUp()
    expect(await setLocationsActiveAction({ ids: ids([f.a01]), isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('재고') },
    })
    expect(await setLocationsActiveAction({ ids: ids([f.a02]), isActive: false })).toEqual({
      ok: true,
      data: { updated: 1 },
    })
    expect(await deleteLocationsAction({ ids: ids([f.a01]) })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(
      await setLocationsActiveAction({ ids: ids([f.icnStaging]), isActive: false }),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: expect.stringContaining('시스템 기본') },
    })
    expect(await deleteLocationsAction({ ids: ids([f.icnStaging]) })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })

    expect(await deleteLocationsAction({ ids: ids([f.a02]) })).toEqual({
      ok: true,
      data: { deleted: 1 },
    })
    expect(await restoreLocationsAction({ ids: ids([f.a02]) })).toEqual({
      ok: true,
      data: { count: 1 },
    })
  })
})

describe('목록', () => {
  const codes = async (filters: Record<string, string>) => {
    const result = await listLocationsAction({ ...createDataGridState(), filters })
    return result.ok ? result.data.rows.map((r) => r.code) : result.error
  }

  beforeEach(async () => {
    await bulkCreateLocationsAction(
      bulk({ row: { from: 1, to: 3, digits: 2 }, level: { from: 1, to: 2, digits: 2 } }),
    )
  })

  it('코드 앞부분·범위, 구역, 재고 유무로 거른다', async () => {
    const gen_ = { warehouse: String(gen) }
    // 준비 데이터의 A-02(구역 없음)도 'A-02'로 시작한다 (구역 있는 것 먼저)
    expect(await codes({ ...gen_, code: 'a-02' })).toEqual(['A-02-01', 'A-02-02', 'A-02'])
    expect(await codes({ ...gen_, codeRange: 'A-01-02~A-02' })).toEqual([
      'A-01-02',
      'A-02-01',
      'A-02-02',
      'A-02',
    ])
    expect(await codes({ ...gen_, zone: String(zoneA), row: '03' })).toEqual(['A-03-01', 'A-03-02'])
    await stockUp()
    expect(await codes({ ...gen_, stock: 'HAS' })).toEqual(['A-01'])
    expect((await codes({ ...gen_, stock: 'EMPTY' })) as string[]).toHaveLength(7)
  })

  it('줄: 기본 배지·구역·출고 할당 적용값(창고 값 상속)·재고 여부, 기본 순서 = 구역 정렬 → 코드', async () => {
    await prisma.warehouse.update({ where: { id: gen }, data: { allocatableYn: 'N' } })
    const result = await listLocationsAction({
      ...createDataGridState(),
      filters: { warehouse: String(gen) },
    })
    if (!result.ok) throw new Error(result.error.message)
    // 구역 없는 A-01·A-02가 마지막 (구역 정렬이 비어 있음)
    expect(result.data.rows.map((r) => r.code).slice(0, 2)).toEqual(['A-01-01', 'A-01-02'])
    expect(result.data.rows[0]).toMatchObject({
      zone: 'A',
      isSystem: false,
      allocatable: false,
      hasStock: false,
      rowNo: '01',
    })
  })

  it('센터 직원: 소속 센터 로케이션만, 다른 센터 로케이션은 고칠 수 없다', async () => {
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    const result = await listLocationsAction(createDataGridState())
    expect(result.ok && result.data.rows.every((r) => r.center.includes('김해'))).toBe(true)
    expect(await setLocationsActiveAction({ ids: ids([f.a01]), isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await createLocationAction(input())).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })
})

describe('사용 가능 판단 (isLocationUsable)', () => {
  it('위 단계 사용 중지·잠금·운영 속성(창고 값 상속)을 따진다', async () => {
    expect(await isLocationUsable(f.a01, 'PUTAWAY')).toEqual({ usable: true, reason: null })
    await prisma.location.update({ where: { id: f.a01 }, data: { outboundYn: 'N' } })
    expect(await isLocationUsable(f.a01, 'PICK')).toMatchObject({
      usable: false,
      reason: expect.stringContaining('피킹'),
    })
    // 입고대기 창고 DEFAULT: 창고 값이 출고 할당 불가
    expect(await isLocationUsable(f.icnStaging, 'ALLOCATE')).toMatchObject({ usable: false })
    await prisma.location.update({
      where: { id: f.a02 },
      data: { lockYn: 'Y', lockReason: 'COUNT' },
    })
    expect(await isLocationUsable(f.a02, 'PUTAWAY')).toMatchObject({
      reason: expect.stringContaining('잠긴'),
    })
    await prisma.warehouse.update({ where: { id: gen }, data: { status: 'INACTIVE' } })
    expect(await isLocationUsable(f.a01, 'PUTAWAY')).toMatchObject({
      reason: '사용 중지된 창고입니다.',
    })
  })
})

describe('엑셀 업로드', () => {
  const row = (rowNo: number, values: Record<string, string>) => ({
    rowNo,
    values: { centerCode: 'icn', warehouseCode: 'gen', ...values },
  })

  it('설명·구역(그 창고의 구역코드)·열·단으로 만들고, 없는 구역은 오류', async () => {
    const rows = [
      row(2, { code: 'f1-07', description: '냉동실 입구 옆', zone: 'a', row: '07', level: '3' }),
      row(3, { code: 'DOCK-01' }),
    ]
    expect(await validateLocationUploadAction(rows)).toMatchObject({
      ok: true,
      data: { errorCount: 0 },
    })
    expect(await commitLocationUploadAction(rows)).toMatchObject({ ok: true, data: { created: 2 } })
    expect(await prisma.location.findFirstOrThrow({ where: { code: 'F1-07' } })).toMatchObject({
      description: '냉동실 입구 옆',
      zoneId: zoneA,
      rowNo: '07',
      levelNo: '3',
      centerId: f.icn,
    })

    const bad = await validateLocationUploadAction([row(2, { code: 'X-1', zone: 'Q' })])
    if (!bad.ok) throw new Error(bad.error.message)
    expect(bad.data.rows[0].errors.join(' ')).toContain('없는 구역')
    expect(await codesOf(gen)).toContain('DOCK-01')
  })
})
