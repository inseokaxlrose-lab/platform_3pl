import { describe, expect, it } from 'vitest'
import { addBusinessDays, dayStatus, weekdayIndex, type CalendarInput } from './business-calendar'

// 센터 영업일 판단 (0096): 센터 지정 → 운영사 전체 → 국가 공휴일 → 운영 요일
// 2026-12-25(금) 성탄절, 2026-12-26(토), 2026-12-28(월)
const calendar = (patch: Partial<CalendarInput> = {}): CalendarInput => ({
  workDays: 'YYYYYNN',
  national: new Map([['2026-12-25', '기독탄신일']]),
  operator: new Map(),
  center: new Map(),
  ...patch,
})

describe('dayStatus', () => {
  it('요일 번호는 월 0 ~ 일 6', () => {
    expect(weekdayIndex('2026-12-28')).toBe(0)
    expect(weekdayIndex('2026-12-27')).toBe(6)
  })

  it('특별한 날이 없으면 운영 요일을 따른다', () => {
    expect(dayStatus(calendar(), '2026-12-24')).toEqual({
      open: true,
      reason: 'WORK_DAYS',
      name: null,
    })
    expect(dayStatus(calendar(), '2026-12-26').open).toBe(false)
  })

  it('국가 공휴일은 운영 요일이어도 쉰다', () => {
    expect(dayStatus(calendar(), '2026-12-25')).toEqual({
      open: false,
      reason: 'NATIONAL_HOLIDAY',
      name: '기독탄신일',
    })
  })

  it('운영사 특근은 국가 공휴일·쉬는 요일보다 먼저다', () => {
    const c = calendar({
      operator: new Map([
        ['2026-12-25', { dayType: 'OPEN', name: '연말 특근' }],
        ['2026-12-26', { dayType: 'OPEN', name: '토요 특근' }],
      ]),
    })
    expect(dayStatus(c, '2026-12-25')).toEqual({
      open: true,
      reason: 'OPERATOR_HOLIDAY',
      name: '연말 특근',
    })
    expect(dayStatus(c, '2026-12-26').open).toBe(true)
  })

  it('센터 지정이 운영사 전체보다 먼저다 (운영사 특근이어도 센터 점검일이면 쉰다)', () => {
    const c = calendar({
      operator: new Map([['2026-12-26', { dayType: 'OPEN', name: '토요 특근' }]]),
      center: new Map([['2026-12-26', { dayType: 'CLOSED', name: '설비 점검' }]]),
    })
    expect(dayStatus(c, '2026-12-26')).toEqual({
      open: false,
      reason: 'CENTER_HOLIDAY',
      name: '설비 점검',
    })
  })
})

describe('addBusinessDays', () => {
  it('공휴일·주말을 건너뛰어 영업일 n일 뒤를 찾는다', () => {
    // 12-24(목) + 1영업일 → 25(공휴일)·26·27(주말) 건너뛰고 28(월)
    expect(addBusinessDays(calendar(), '2026-12-24', 1)).toBe('2026-12-28')
    // 0이면 그날 또는 다음 영업일
    expect(addBusinessDays(calendar(), '2026-12-24', 0)).toBe('2026-12-24')
    expect(addBusinessDays(calendar(), '2026-12-25', 0)).toBe('2026-12-28')
  })

  it('특근일은 영업일로 센다', () => {
    const c = calendar({ center: new Map([['2026-12-26', { dayType: 'OPEN', name: '특근' }]]) })
    expect(addBusinessDays(c, '2026-12-24', 1)).toBe('2026-12-26')
  })

  it('모든 요일이 쉬는 센터면 null', () => {
    expect(addBusinessDays(calendar({ workDays: 'NNNNNNN' }), '2026-12-24', 1, 30)).toBeNull()
  })
})
