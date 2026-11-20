import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import { prisma } from '@/lib/prisma'
import { applyRegionChange } from '@/lib/regions/region-assign'
import { loadRegionMaster } from '@/lib/regions/region-load'
import { resolveShipToRoutes } from '@/lib/routes/route-resolve'
import type { RouteCreateInput } from '@/lib/routes/route-schema'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, versionOf } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  assignRouteZipsAction,
  createRouteAction,
  deleteRoutesAction,
  listRouteRegionsAction,
  listRoutesAction,
  planRouteZipsAction,
  restoreRoutesAction,
  unassignRouteZipsAction,
  updateRouteAction,
} from './actions'

// 배송 코스 (docs/decisions/0095): 센터별 코스 + 우편번호 배정 + 납품처 코스 정하기
// 지역 샘플: 권선구 16613 권선동 / 16620 호매실동 / 16625 금곡동+호매실동, 이천 17384, 강남 06236

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

function signIn(scope: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(ALL_PERMISSION_CODES))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let suwon = 0n
let icheon = 0n

const input = (overrides: Partial<RouteCreateInput> = {}): RouteCreateInput => ({
  centerId: String(suwon),
  code: 'R01',
  custCode: '',
  name: '권선 1코스',
  carrierId: '',
  runDays: 'YYYYYNN',
  cutoffTime: '14:00',
  vehicleTon: '',
  destHub: '',
  status: 'ACTIVE',
  sortOrder: 10,
  remark: '',
  ...overrides,
})

async function create(overrides: Partial<RouteCreateInput> = {}) {
  const result = await createRouteAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const zipsOf = async (routeId: string) =>
  (
    await prisma.routeZip.findMany({
      where: { routeId: BigInt(routeId) },
      orderBy: { zipCode: 'asc' },
    })
  ).map((z) => z.zipCode)

beforeEach(async () => {
  await resetDatabase()
  signIn()
  await loadRegionMaster(prisma, {
    loadVer: '202611',
    bjdFile: 'src/test/fixtures/region/bjd-sample.csv',
    addressFiles: ['src/test/fixtures/region/address-sample.txt'],
  })
  suwon = (await createTestCenter('SUW', { name: '수원센터' })).id
  icheon = (await createTestCenter('ICN', { name: '이천센터' })).id
  // 권역설정: 권선구 3개 → 수원, 이천 → 이천
  await prisma.$transaction((tx) =>
    applyRegionChange(tx, TEST_OPERATOR_ID, {
      zips: ['16613', '16620', '16625'],
      centerId: suwon,
      tempZone: 'ALL',
      changeType: 'GRID_ASSIGN',
      scopeDesc: '테스트',
    }),
  )
  await prisma.$transaction((tx) =>
    applyRegionChange(tx, TEST_OPERATOR_ID, {
      zips: ['17384'],
      centerId: icheon,
      tempZone: 'ALL',
      changeType: 'GRID_ASSIGN',
      scopeDesc: '테스트',
    }),
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('코스 등록·수정', () => {
  it('코드는 센터 안에서만 고유 (다른 센터는 같은 코드 가능), 출발 마감 시각 저장', async () => {
    const { id } = await create({ code: 'r01' })
    expect(await prisma.route.findUniqueOrThrow({ where: { id: BigInt(id) } })).toMatchObject({
      code: 'R01',
      runDays: 'YYYYYNN',
    })
    expect(await createRouteAction(input())).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect((await createRouteAction(input({ centerId: String(icheon) }))).ok).toBe(true)
  })

  it('운행 요일은 하나 이상, 차량 톤수는 공통코드 값만', async () => {
    expect(await createRouteAction(input({ runDays: 'NNNNNNN' }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { runDays: [expect.any(String)] } },
    })
    expect(await createRouteAction(input({ vehicleTon: 'NOPE' }))).toMatchObject({ ok: false })
  })

  it('센터 직원: 소속 센터 코스만 보고, 다른 센터에는 만들거나 고칠 수 없다', async () => {
    const atIcheon = await create({ centerId: String(icheon), code: 'I01' })
    await create()
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [suwon] })
    const list = await listRoutesAction(createDataGridState())
    expect(list.ok && list.data.rows.map((r) => r.code)).toEqual(['R01'])
    expect(await createRouteAction(input({ centerId: String(icheon), code: 'X' }))).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { centerId, code, ...rest } = input()
    expect(
      await updateRouteAction({
        ...rest,
        id: atIcheon.id,
        rowVersion: await versionOf('route', atIcheon.id),
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })
})

describe('우편번호 배정', () => {
  it('붙여넣기: 권역설정이 이 센터인 것만 (기본), 다른 센터·없는 우편번호는 빠진다', async () => {
    const { id } = await create()
    const plan = await planRouteZipsAction({ routeId: id, text: '16613 16620 17384 99999' })
    expect(plan).toMatchObject({ ok: true, data: { count: 2, outsideCenter: 0 } })
    expect((await assignRouteZipsAction({ routeId: id, text: '16613 16620 17384 99999' })).ok).toBe(
      true,
    )
    expect(await zipsOf(id)).toEqual(['16613', '16620'])
  })

  it('"이 센터만"을 끄면 권역 밖 우편번호도 넣되 미리보기에서 알린다, 없는 우편번호는 뺀다', async () => {
    const { id } = await create()
    const plan = await planRouteZipsAction({ routeId: id, text: '17384 99999', onlyCenter: false })
    expect(plan).toMatchObject({
      ok: true,
      data: { count: 1, outsideCenter: 1, unknown: ['99999'] },
    })
  })

  it('같은 센터의 다른 코스에 있던 우편번호는 옮겨 오고, 미리보기에 건수가 나온다', async () => {
    const first = await create()
    const second = await create({ code: 'R02', name: '권선 2코스' })
    await assignRouteZipsAction({ routeId: first.id, text: '16613 16620' })
    const plan = await planRouteZipsAction({ routeId: second.id, text: '16620 16625' })
    expect(plan).toMatchObject({
      ok: true,
      data: { count: 2, moves: [{ code: 'R01', count: 1 }] },
    })
    await assignRouteZipsAction({ routeId: second.id, text: '16620 16625' })
    expect(await zipsOf(first.id)).toEqual(['16613'])
    expect(await zipsOf(second.id)).toEqual(['16620', '16625'])
  })

  it('지역으로 고르기: 시도 → 시군구 → 읍면동, 읍면동이면 경계 우편번호는 빠진다', async () => {
    const { id } = await create()
    const sidos = await listRouteRegionsAction({ parent: null })
    const gyeonggi = sidos.ok ? sidos.data.find((s) => s.name.startsWith('경기')) : undefined
    const sigungus = await listRouteRegionsAction({
      parent: { level: 'SIDO', code: gyeonggi!.code },
    })
    const gwonseon = sigungus.ok ? sigungus.data.find((s) => s.name.includes('권선')) : undefined
    const emds = await listRouteRegionsAction({
      parent: { level: 'SIGUNGU', code: gwonseon!.code },
    })
    const homaesil = emds.ok ? emds.data.find((e) => e.name === '호매실동') : undefined
    await assignRouteZipsAction({
      routeId: id,
      node: { level: 'EMD', code: homaesil!.code },
    })
    // 16625는 금곡동에도 걸친 경계 우편번호라 빠진다
    expect(await zipsOf(id)).toEqual(['16620'])
  })

  it('빼기는 이 코스의 우편번호만', async () => {
    const { id } = await create()
    await assignRouteZipsAction({ routeId: id, text: '16613 16620' })
    expect(await unassignRouteZipsAction({ routeId: id, zips: ['16613'] })).toMatchObject({
      ok: true,
      data: { count: 1 },
    })
    expect(await zipsOf(id)).toEqual(['16620'])
  })
})

describe('납품처 코스 정하기', () => {
  it('직접 지정(배송센터의 사용 중 코스) → 배송센터 + 우편번호 배정 → 없음', async () => {
    const zipRoute = await create()
    const manualRoute = await create({ code: 'R09', name: '특별 코스' })
    const otherCenter = await create({ centerId: String(icheon), code: 'I01' })
    await assignRouteZipsAction({ routeId: zipRoute.id, text: '16613' })
    const [byZip, manual, wrongCenter, none] = await resolveShipToRoutes(prisma, [
      { routeId: null, deliveryCenterId: suwon, zipCode: '16613' },
      { routeId: BigInt(manualRoute.id), deliveryCenterId: suwon, zipCode: '16613' },
      // 다른 센터의 코스를 지정해 두었으면 무시하고 우편번호 배정
      { routeId: BigInt(otherCenter.id), deliveryCenterId: suwon, zipCode: '16613' },
      { routeId: null, deliveryCenterId: icheon, zipCode: '16613' },
    ])
    expect(byZip).toMatchObject({ code: 'R01', by: 'ZIP' })
    expect(manual).toMatchObject({ code: 'R09', by: 'MANUAL' })
    expect(wrongCenter).toMatchObject({ code: 'R01', by: 'ZIP' })
    expect(none).toBeNull()

    // 사용 중지한 코스는 쓰지 않는다
    await prisma.route.update({ where: { id: BigInt(zipRoute.id) }, data: { status: 'INACTIVE' } })
    expect(
      (
        await resolveShipToRoutes(prisma, [
          { routeId: null, deliveryCenterId: suwon, zipCode: '16613' },
        ])
      )[0],
    ).toBeNull()
  })
})

describe('삭제·되살리기', () => {
  it('지우면 우편번호 배정도 지워지고, 같은 코드가 다시 생겼으면 되살릴 수 없다', async () => {
    const { id } = await create()
    await assignRouteZipsAction({ routeId: id, text: '16613' })
    expect(await deleteRoutesAction({ ids: [id] })).toMatchObject({ ok: true })
    expect(await prisma.routeZip.count()).toBe(0)
    await create()
    expect(await restoreRoutesAction({ ids: [id] })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})
