import type { HolidayDayType } from './holiday-codes'

// 센터 영업일 판단 (docs/decisions/0096) — 순수 함수, 출고 예정일·리드타임 계산에서 쓴다
// 판단 순서 (먼저 맞는 것으로 정한다)
//   1. 그 센터에 지정한 운영사 휴일 (휴무 / 특근)
//   2. 운영사 전체 휴일 (휴무 / 특근)
//   3. 국가 공휴일 → 쉼
//   4. 센터 운영 요일 (work_days, 월~일 7글자 Y/N)
// 좁은 범위가 넓은 범위를 이긴다: 운영사 전체 특근이어도 그 센터가 점검 휴무면 쉰다

export type DayReason = 'CENTER_HOLIDAY' | 'OPERATOR_HOLIDAY' | 'NATIONAL_HOLIDAY' | 'WORK_DAYS'

export type DayStatus = { open: boolean; reason: DayReason; name: string | null }

export type CalendarInput = {
  workDays: string // 'YYYYYNN'
  national: ReadonlyMap<string, string> // 날짜 → 공휴일 이름
  operator: ReadonlyMap<string, { dayType: HolidayDayType; name: string }> // 운영사 전체
  center: ReadonlyMap<string, { dayType: HolidayDayType; name: string }> // 이 센터 지정
}

// 'YYYY-MM-DD' → 월(0)~일(6)
export function weekdayIndex(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay() // 일 0 ~ 토 6
  return (day + 6) % 7
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function dayStatus(calendar: CalendarInput, date: string): DayStatus {
  const own = calendar.center.get(date)
  if (own) return { open: own.dayType === 'OPEN', reason: 'CENTER_HOLIDAY', name: own.name }
  const shared = calendar.operator.get(date)
  if (shared) {
    return { open: shared.dayType === 'OPEN', reason: 'OPERATOR_HOLIDAY', name: shared.name }
  }
  const national = calendar.national.get(date)
  if (national !== undefined) return { open: false, reason: 'NATIONAL_HOLIDAY', name: national }
  return { open: calendar.workDays[weekdayIndex(date)] === 'Y', reason: 'WORK_DAYS', name: null }
}

// 영업일 n일 뒤 (0이면 그날이 영업일이면 그날, 아니면 다음 영업일). 찾지 못하면 null (모든 요일이 쉬는 센터 등)
export function addBusinessDays(calendar: CalendarInput, date: string, n: number, limit = 366) {
  let current = date
  let remaining = n
  for (let step = 0; step <= limit; step++) {
    if (dayStatus(calendar, current).open) {
      if (remaining === 0) return current
      remaining--
    }
    current = addDays(current, 1)
  }
  return null
}
