import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  countLocationRange,
  expandLocationRange,
  locationCodeField,
  locationRangeSchema,
  MAX_BULK_LOCATIONS,
} from './location-range'

const range = (overrides = {}) =>
  locationRangeSchema.parse({
    zoneFrom: 'a',
    zoneTo: 'b',
    aisleFrom: 1,
    aisleTo: 10,
    aisleDigits: 2,
    levelFrom: 1,
    levelTo: 5,
    levelDigits: 2,
    separator: '-',
    ...overrides,
  })

describe('로케이션 일괄 생성 규칙', () => {
  it('구역 → 열 → 단 순서, 0을 채운 코드와 구역·열·단을 함께 만든다', () => {
    const list = expandLocationRange(range())
    expect(list).toHaveLength(100)
    expect(list[0]).toEqual({ code: 'A-01-01', zone: 'A', aisle: '01', level: '01' })
    expect(list[1].code).toBe('A-01-02')
    expect(list[5].code).toBe('A-02-01')
    expect(list[99].code).toBe('B-10-05')
    expect(countLocationRange(range())).toBe(100)
  })

  it('구분자 없음, 자릿수 1·3', () => {
    const list = expandLocationRange(
      range({ zoneTo: 'a', aisleTo: 2, aisleDigits: 3, levelTo: 2, levelDigits: 1, separator: '' }),
    )
    expect(list.map((l) => l.code)).toEqual(['A0011', 'A0012', 'A0021', 'A0022'])
  })

  it('잘못된 범위: 끝이 시작보다 앞, 자릿수 초과, 영문 한 글자 아님', () => {
    const parsed = locationRangeSchema.safeParse({
      zoneFrom: 'C',
      zoneTo: 'A',
      aisleFrom: 5,
      aisleTo: 100,
      aisleDigits: 2,
      levelFrom: 3,
      levelTo: 1,
      levelDigits: 1,
      separator: '-',
    })
    expect(parsed.success).toBe(false)
    const errors = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors
    expect(errors).toMatchObject({
      zoneTo: [expect.stringContaining('구역')],
      aisleDigits: [expect.stringContaining('자릿수')],
      levelTo: [expect.stringContaining('단')],
    })
    expect(locationRangeSchema.safeParse({ ...range(), zoneFrom: 'AB' }).success).toBe(false)
  })

  it(`한 번에 ${MAX_BULK_LOCATIONS}개를 넘으면 거부하고 개수를 알려준다`, () => {
    const parsed = locationRangeSchema.safeParse({
      ...range(),
      zoneFrom: 'A',
      zoneTo: 'Z',
      aisleTo: 99,
      levelTo: 9,
    })
    expect(parsed.success).toBe(false)
    expect(parsed.success ? '' : parsed.error.issues[0].message).toContain('23,166개')
  })

  it('로케이션 코드 한 칸: 대문자로, 영문·숫자·하이픈만', () => {
    expect(locationCodeField.parse(' a-01-01 ')).toBe('A-01-01')
    expect(locationCodeField.safeParse('A 01').success).toBe(false)
    expect(locationCodeField.safeParse('').success).toBe(false)
  })
})
