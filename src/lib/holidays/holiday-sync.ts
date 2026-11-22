import 'server-only'
import { currentActor } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { fetchNationalHolidays, type HolidayFetcher } from './holiday-api'
import type { HolidaySyncStatus } from './holiday-codes'

// 국가 공휴일 가져오기 (docs/decisions/0096)
// - 연도 단위로 통째로 바꾼다 (임시공휴일이 새로 생기거나 이름이 바뀌어도 그대로 맞춘다)
// - API를 못 쓰면(키 없음·연결 오류) 기존 공휴일은 그대로 두고 결과만 '실패'로 남긴다
// - 0건이면 '발표 전'으로 남기고 기존 공휴일도 지우지 않는다 (API가 잠깐 비어 오는 경우 대비)

// 자동 가져오기에서 '발표 전'·'실패'를 다시 시도하는 간격 (화면을 열 때마다 API를 부르지 않게)
export const RETRY_AFTER_MS = 24 * 60 * 60 * 1000

export type HolidaySyncResult = {
  year: number
  status: HolidaySyncStatus
  count: number
  message: string | null
}

const dateOf = (text: string) => new Date(`${text}T00:00:00.000Z`)

export async function syncNationalHolidays(
  year: number,
  fetcher: HolidayFetcher = fetchNationalHolidays,
): Promise<HolidaySyncResult> {
  const fetched = await fetcher(year)
  const syncedBy = currentActor()
  const record = async (status: HolidaySyncStatus, count: number, message: string | null) => {
    const data = { status, holidayCount: count, message, syncedAt: new Date(), syncedBy }
    await prisma.holidayYear.upsert({ where: { year }, create: { year, ...data }, update: data })
    return { year, status, count, message }
  }

  if (fetched.status === 'UNAVAILABLE') {
    // 실패해도 이전에 가져온 자료가 있으면 그 건수를 그대로 보여 준다
    return record('FAILED', await keptDays(year), fetched.reason.slice(0, 500))
  }
  // 같은 날·같은 이름은 한 번만
  const unique = [...new Map(fetched.holidays.map((h) => [`${h.date}|${h.name}`, h])).values()]
  if (unique.length === 0) {
    return record('EMPTY', await keptDays(year), '아직 이 연도의 공휴일이 발표되지 않았습니다.')
  }
  await prisma.$transaction([
    prisma.holiday.deleteMany({ where: yearWhere(year) }),
    prisma.holiday.createMany({
      data: unique.map((h) => ({ holidayOn: dateOf(h.date), name: h.name.slice(0, 100) })),
    }),
  ])
  // 같은 날 이름이 둘이어도(예: 2028-10-03 개천절·추석) 하루로 센다
  return record('OK', new Set(unique.map((h) => h.date)).size, null)
}

// 이미 받아 둔 공휴일의 날짜 수 (실패·발표 전일 때 배지에 그대로 보여 준다)
async function keptDays(year: number) {
  const rows = await prisma.holiday.findMany({
    where: yearWhere(year),
    distinct: ['holidayOn'],
    select: { holidayOn: true },
  })
  return rows.length
}

function yearWhere(year: number) {
  return { holidayOn: { gte: dateOf(`${year}-01-01`), lte: dateOf(`${year}-12-31`) } }
}

// 화면을 열 때 자동 가져오기: 아직 가져온 적 없는 연도, 또는 '발표 전'·'실패' 뒤 하루가 지난 연도만
export async function ensureNationalHolidays(
  years: number[],
  fetcher: HolidayFetcher = fetchNationalHolidays,
  now = new Date(),
) {
  const done = await prisma.holidayYear.findMany({
    where: { year: { in: years } },
    select: { year: true, status: true, syncedAt: true },
  })
  const byYear = new Map(done.map((d) => [d.year, d]))
  const due = years.filter((year) => {
    const last = byYear.get(year)
    if (!last) return true
    return last.status !== 'OK' && now.getTime() - last.syncedAt.getTime() >= RETRY_AFTER_MS
  })
  const results: HolidaySyncResult[] = []
  // 연도 몇 개뿐이라 차례로 (API 호출을 한꺼번에 몰지 않는다)
  for (const year of due) results.push(await syncNationalHolidays(year, fetcher))
  return results
}

// 연도별 가져오기 결과 (화면 안내용)
export async function holidayYearStatus(years: number[]) {
  const rows = await prisma.holidayYear.findMany({
    where: { year: { in: years } },
    orderBy: { year: 'asc' },
    select: { year: true, status: true, holidayCount: true, message: true, syncedAt: true },
  })
  return rows
}
