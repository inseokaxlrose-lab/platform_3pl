import { describe, expect, it } from 'vitest'
import { expiryState, kstToday } from './expiry'

describe('유통기한 상태', () => {
  it('남은 일수·임박(품목 기준 일수 이하)·만료, 기준이 없으면 임박 없음', () => {
    const today = '2026-11-16'
    expect(expiryState('2026-11-26', 30, today)).toEqual({ state: 'SOON', daysLeft: 10 })
    expect(expiryState('2027-01-31', 30, today)).toEqual({ state: 'OK', daysLeft: 76 })
    expect(expiryState('2026-11-16', 0, today)).toEqual({ state: 'SOON', daysLeft: 0 })
    expect(expiryState('2026-11-15', 30, today)).toEqual({ state: 'EXPIRED', daysLeft: -1 })
    expect(expiryState('2026-11-20', null, today)).toEqual({ state: 'OK', daysLeft: 4 })
    expect(expiryState(null, 30, today)).toEqual({ state: 'NONE', daysLeft: null })
  })

  it('오늘은 한국 날짜', () => {
    expect(kstToday(new Date('2026-11-15T15:00:00Z'))).toBe('2026-11-16')
  })
})
