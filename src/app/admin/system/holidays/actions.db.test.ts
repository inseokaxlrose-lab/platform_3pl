import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import { addBusinessDays, dayStatus } from '@/lib/holidays/business-calendar'
import { loadCenterCalendar } from '@/lib/holidays/business-calendar-loader'
import type { HolidayFetcher } from '@/lib/holidays/holiday-api'
import type { OperatorHolidayInput } from '@/lib/holidays/holiday-schema'
import {
  ensureNationalHolidays,
  RETRY_AFTER_MS,
  syncNationalHolidays,
} from '@/lib/holidays/holiday-sync'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, versionOf } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createHolidayAction,
  deleteHolidaysAction,
  listHolidaysAction,
  restoreHolidaysAction,
  updateHolidayAction,
} from './actions'

// 휴무관리 (docs/decisions/0096): 국가 공휴일 가져오기 + 운영사·센터 휴무·특근 + 영업일 판단
// 2026-12-25(금) 성탄절, 2026-12-26(토)

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

// 가짜 API: 부른 연도를 기록하고 정해 둔 결과를 돌려준다
function fakeApi(byYear: Record<number, { date: string; name: string }[] | 'DOWN'>) {
  const calls: number[] = []
  const fetcher: HolidayFetcher = async (year) => {
    calls.push(year)
    const result = byYear[year] ?? []
    return result === 'DOWN'
      ? {
          status: 'UNAVAILABLE',
          reason: '공휴일 API 키(DATA_GO_KR_SERVICE_KEY)가 설정되지 않았습니다.',
        }
      : { status: 'OK', holidays: result }
  }
  return { fetcher, calls }
}

const H2026 = [
  { date: '2026-01-01', name: '1월1일' },
  { date: '2026-12-25', name: '기독탄신일' },
]

let suwon = 0n
let icheon = 0n

const input = (overrides: Partial<OperatorHolidayInput> = {}): OperatorHolidayInput => ({
  centerId: '',
  holidayOn: '2026-12-31',
  name: '종무식',
  dayType: 'CLOSED',
  remark: '',
  ...overrides,
})

async function create(overrides: Partial<OperatorHolidayInput> = {}) {
  const result = await createHolidayAction(input(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const list = async (filters: Record<string, string> = {}) => {
  const result = await listHolidaysAction({ ...createDataGridState({ pageSize: 50 }), filters })
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  suwon = (await createTestCenter('SUW')).id
  icheon = (await createTestCenter('ICN')).id
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('국가 공휴일 가져오기', () => {
  it('연도를 통째로 바꾸고 결과를 남긴다 (임시공휴일 추가·이름 변경 반영)', async () => {
    const first = await syncNationalHolidays(2026, fakeApi({ 2026: H2026 }).fetcher)
    expect(first).toMatchObject({ status: 'OK', count: 2 })
    const again = await syncNationalHolidays(
      2026,
      fakeApi({ 2026: [...H2026, { date: '2026-06-03', name: '임시공휴일' }] }).fetcher,
    )
    expect(again.count).toBe(3)
    expect(await prisma.holiday.count()).toBe(3)
    const year = await prisma.holidayYear.findUniqueOrThrow({ where: { year: 2026 } })
    expect(year).toMatchObject({ status: 'OK', holidayCount: 3, message: null })
  })

  it('API를 못 쓰거나 0건이면 기존 공휴일을 지우지 않는다', async () => {
    await syncNationalHolidays(2026, fakeApi({ 2026: H2026 }).fetcher)
    const down = await syncNationalHolidays(2026, fakeApi({ 2026: 'DOWN' }).fetcher)
    expect(down).toMatchObject({ status: 'FAILED', count: 2 })
    expect(down.message).toContain('DATA_GO_KR_SERVICE_KEY')
    const empty = await syncNationalHolidays(2026, fakeApi({ 2026: [] }).fetcher)
    expect(empty.status).toBe('EMPTY')
    expect(await prisma.holiday.count()).toBe(2)
  })

  it('화면을 열 때: 처음 보는 연도만 가져오고, 발표 전·실패는 하루 뒤에 다시 시도한다', async () => {
    const api = fakeApi({ 2026: H2026, 2027: [] })
    await ensureNationalHolidays([2026, 2027], api.fetcher)
    expect(api.calls).toEqual([2026, 2027])
    // 바로 다시 열면 부르지 않는다
    await ensureNationalHolidays([2026, 2027], api.fetcher)
    expect(api.calls).toEqual([2026, 2027])
    // 하루 뒤: 2027(발표 전)만 다시
    await ensureNationalHolidays(
      [2026, 2027],
      api.fetcher,
      new Date(Date.now() + RETRY_AFTER_MS + 1000),
    )
    expect(api.calls).toEqual([2026, 2027, 2027])
  })
})

describe('운영사 개별 휴일', () => {
  it('운영사 전체·센터 지정으로 등록하고, 같은 범위·같은 날짜는 거부한다', async () => {
    await create()
    await create({ centerId: String(suwon), name: '수원 재고 실사' })
    const dup = await createHolidayAction(input({ name: '또 종무식' }))
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error.message).toContain('운영사 전체에 이미 등록한 날짜')
    const dupCenter = await createHolidayAction(input({ centerId: String(suwon) }))
    expect(dupCenter.ok).toBe(false)
    // 다른 센터는 같은 날짜여도 된다
    await create({ centerId: String(icheon), name: '이천 점검' })
  })

  it('수정: 버전을 확인하고 범위를 바꿀 때도 날짜 중복을 막는다', async () => {
    const wide = await create()
    const own = await create({ centerId: String(suwon), holidayOn: '2026-12-30', name: '실사' })
    const moved = await updateHolidayAction({
      ...input({ centerId: String(suwon), holidayOn: '2026-12-31', name: '실사' }),
      id: String(own.id),
      rowVersion: await versionOf('operatorHoliday', own.id),
    })
    expect(moved.ok).toBe(true)
    const stale = await updateHolidayAction({
      ...input({ name: '종무식2' }),
      id: String(wide.id),
      rowVersion: 99,
    })
    expect(stale.ok).toBe(false)
  })

  it('센터 직원: 소속 센터 휴일만 등록·수정, 운영사 전체 휴일은 보기만', async () => {
    const wide = await create()
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [suwon] })
    const denied = await createHolidayAction(input({ holidayOn: '2026-12-30' }))
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.error.message).toContain('운영사 관리자만')
    const other = await createHolidayAction(input({ centerId: String(icheon) }))
    expect(other.ok).toBe(false)
    await create({ centerId: String(suwon), name: '수원 점검' })
    const removeWide = await deleteHolidaysAction({ ids: [String(wide.id)] })
    expect(removeWide.ok).toBe(false)

    signIn()
    await create({ centerId: String(icheon), name: '이천 점검' })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [suwon] })
    const rows = (await list({ year: '2026' })).rows
    // 이천 휴일은 보이지 않고, 운영사 전체 휴일은 고칠 수 없게 표시
    expect(rows.map((r) => [r.name, r.editable])).toEqual([
      ['종무식', false],
      ['수원 점검', true],
    ])
  })

  it('다른 운영사의 센터에는 등록하지 못한다', async () => {
    const other = await createTestOperator('다른 운영사')
    const otherCenter = await createTestCenter('OTH', { operatorId: other.id })
    const result = await createHolidayAction(input({ centerId: String(otherCenter.id) }))
    expect(result.ok).toBe(false)
  })

  it('삭제 → 되살리기, 그 사이 같은 날짜를 다시 등록했으면 되살리지 않는다', async () => {
    const first = await create()
    expect((await deleteHolidaysAction({ ids: [String(first.id)] })).ok).toBe(true)
    expect((await list({ status: 'DELETED' })).rows.map((r) => r.name)).toEqual(['종무식'])
    await create({ name: '새 종무식' })
    const blocked = await restoreHolidaysAction({ ids: [String(first.id)] })
    expect(blocked.ok).toBe(false)
  })
})

describe('목록', () => {
  it('국가 공휴일과 개별 휴일을 날짜순으로 합치고, 구분·센터로 거른다', async () => {
    await syncNationalHolidays(2026, fakeApi({ 2026: H2026 }).fetcher)
    await create({ holidayOn: '2026-12-25', name: '성탄 특근', dayType: 'OPEN' })
    await create({ centerId: String(suwon), holidayOn: '2026-12-24', name: '수원 점검' })
    await create({ centerId: String(icheon), holidayOn: '2026-12-24', name: '이천 점검' })

    const all = await list({ year: '2026' })
    expect(all.rows.map((r) => `${r.holidayOn} ${r.kind} ${r.name}`)).toEqual([
      '2026-01-01 NATIONAL 1월1일',
      '2026-12-24 CLOSED 수원 점검',
      '2026-12-24 CLOSED 이천 점검',
      '2026-12-25 NATIONAL 기독탄신일',
      '2026-12-25 OPEN 성탄 특근',
    ])
    expect(all.rows[0]).toMatchObject({
      id: expect.stringMatching(/^N/),
      editable: false,
      weekday: '목',
    })

    // 센터를 고르면 그 센터에 적용되는 휴일 (국가·운영사 전체·그 센터)
    const forSuwon = await list({ year: '2026', center: String(suwon) })
    expect(forSuwon.rows.map((r) => r.name)).not.toContain('이천 점검')
    expect(forSuwon.rowCount).toBe(4)

    const onlyOpen = await list({ year: '2026', kind: 'OPEN' })
    expect(onlyOpen.rows.map((r) => r.name)).toEqual(['성탄 특근'])
    expect((await list({ year: '2027' })).rowCount).toBe(0)
  })
})

describe('센터 영업일 판단 (DB)', () => {
  it('국가 공휴일·운영사 특근·센터 휴무를 순서대로 적용한다', async () => {
    await syncNationalHolidays(2026, fakeApi({ 2026: H2026 }).fetcher)
    await create({ holidayOn: '2026-12-26', name: '토요 특근', dayType: 'OPEN' })
    await create({ centerId: String(icheon), holidayOn: '2026-12-26', name: '이천 점검' })

    const suwonCal = await loadCenterCalendar(suwon, '2026-12-01', '2026-12-31')
    expect(dayStatus(suwonCal, '2026-12-25').reason).toBe('NATIONAL_HOLIDAY')
    // 12-24 + 1영업일: 25(공휴일) 건너 26(토요 특근)
    expect(addBusinessDays(suwonCal, '2026-12-24', 1)).toBe('2026-12-26')

    const icheonCal = await loadCenterCalendar(icheon, '2026-12-01', '2026-12-31')
    expect(dayStatus(icheonCal, '2026-12-26')).toMatchObject({
      open: false,
      reason: 'CENTER_HOLIDAY',
    })
    expect(addBusinessDays(icheonCal, '2026-12-24', 1)).toBe('2026-12-28')
  })

  it('지운 휴일은 판단에 쓰지 않는다', async () => {
    const special = await create({ holidayOn: '2026-12-26', name: '토요 특근', dayType: 'OPEN' })
    await deleteHolidaysAction({ ids: [String(special.id)] })
    const cal = await loadCenterCalendar(suwon, '2026-12-01', '2026-12-31')
    expect(dayStatus(cal, '2026-12-26').open).toBe(false)
  })
})
