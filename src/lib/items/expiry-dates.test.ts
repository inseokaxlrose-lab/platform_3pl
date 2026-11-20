import { describe, expect, it } from 'vitest'
import { addDays, resolveExpiryDates, type ExpiryRule } from './expiry-dates'

// 제조일·유통기한 정하기 (0089)
const rule = (expiryInput: string | null, shelfLifeDays: number | null = 365): ExpiryRule => ({
  useExpiry: true,
  expiryInput,
  shelfLifeDays,
})

describe('resolveExpiryDates', () => {
  it('기한일 입력: 유통기한 필수, 제조일은 선택', () => {
    expect(resolveExpiryDates(rule('EXPIRY'), { expiryOn: '2027-01-31' })).toEqual({
      dates: { expiryOn: '2027-01-31', mfgOn: null },
      issue: null,
    })
    expect(resolveExpiryDates(rule('EXPIRY'), {}).issue?.field).toBe('expiryOn')
    // 비어 있는 방식(화주사 기본값으로 관리)도 기한일 입력
    expect(
      resolveExpiryDates(rule(null), { expiryOn: '2027-01-31', mfgOn: '2026-01-31' }).dates,
    ).toEqual({ expiryOn: '2027-01-31', mfgOn: '2026-01-31' })
  })

  it('제조일 입력: 유통기한 = 제조일 + 총 기한 일수 (넣은 유통기한은 쓰지 않음)', () => {
    expect(
      resolveExpiryDates(rule('MFG', 30), { mfgOn: '2026-11-20', expiryOn: '2030-01-01' }).dates,
    ).toEqual({ expiryOn: '2026-12-20', mfgOn: '2026-11-20' })
    expect(resolveExpiryDates(rule('MFG'), { expiryOn: '2027-01-31' }).issue?.field).toBe('mfgOn')
  })

  it('둘 다: 둘 다 필수, 제조일이 유통기한보다 늦으면 거부', () => {
    expect(resolveExpiryDates(rule('BOTH'), { expiryOn: '2027-01-31' }).issue?.field).toBe('mfgOn')
    expect(
      resolveExpiryDates(rule('BOTH'), { expiryOn: '2027-01-31', mfgOn: '2027-02-01' }).issue,
    ).toEqual({ field: 'mfgOn', message: '제조일이 유통기한보다 늦습니다.' })
  })

  it('유통기한을 관리하지 않는 품목은 둘 다 비운다, ASN(필수 아님)은 빈 값 허용', () => {
    const none: ExpiryRule = { useExpiry: false, expiryInput: null, shelfLifeDays: null }
    expect(resolveExpiryDates(none, {}).dates).toEqual({ expiryOn: null, mfgOn: null })
    expect(resolveExpiryDates(none, { mfgOn: '2026-01-01' }).issue?.field).toBe('mfgOn')
    expect(resolveExpiryDates(rule('MFG'), {}, false).dates).toEqual({
      expiryOn: null,
      mfgOn: null,
    })
    expect(resolveExpiryDates(rule('BOTH'), {}, false).issue).toBeNull()
  })

  it('addDays: 달·해 넘김', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})
