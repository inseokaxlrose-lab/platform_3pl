import 'server-only'
import { prisma } from '@/lib/prisma'
import { toValue } from '@/lib/db-value'
import type { CalendarInput } from './business-calendar'
import { HOLIDAY_DAY_TYPE } from './holiday-codes'

// 센터 영업일 판단 자료 읽기 (docs/decisions/0096): 기간 안의 국가 공휴일 + 그 운영사 휴일 + 센터 운영 요일
const dateOf = (text: string) => new Date(`${text}T00:00:00.000Z`)
const textOf = (date: Date) => date.toISOString().slice(0, 10)

export async function loadCenterCalendar(
  centerId: bigint,
  from: string,
  to: string,
): Promise<CalendarInput> {
  const center = await prisma.center.findUniqueOrThrow({
    where: { id: centerId },
    select: { operatorId: true, workDays: true },
  })
  const range = { gte: dateOf(from), lte: dateOf(to) }
  const [national, own] = await Promise.all([
    prisma.holiday.findMany({
      where: { holidayOn: range },
      select: { holidayOn: true, name: true },
    }),
    prisma.operatorHoliday.findMany({
      where: {
        operatorId: center.operatorId,
        holidayOn: range,
        OR: [{ centerId: null }, { centerId }],
      },
      select: { centerId: true, holidayOn: true, name: true, dayType: true },
    }),
  ])
  const nationalMap = new Map<string, string>()
  for (const h of national) {
    const day = textOf(h.holidayOn)
    // 같은 날 이름이 둘이면 이어 붙인다 (예: 어린이날·부처님오신날)
    nationalMap.set(day, nationalMap.has(day) ? `${nationalMap.get(day)}·${h.name}` : h.name)
  }
  const entry = (h: (typeof own)[number]) => ({
    dayType: toValue(HOLIDAY_DAY_TYPE.values, h.dayType),
    name: h.name,
  })
  return {
    workDays: center.workDays,
    national: nationalMap,
    operator: new Map(
      own.filter((h) => h.centerId === null).map((h) => [textOf(h.holidayOn), entry(h)]),
    ),
    center: new Map(
      own.filter((h) => h.centerId !== null).map((h) => [textOf(h.holidayOn), entry(h)]),
    ),
  }
}
