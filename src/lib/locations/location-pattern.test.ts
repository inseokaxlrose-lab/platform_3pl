import { describe, expect, it } from 'vitest'
import {
  countLocationPattern,
  defaultPattern,
  expandLocationPattern,
  locationPatternSchema,
  patternTokens,
  suggestLocationCode,
  type LocationPattern,
} from './location-pattern'

// 로케이션 코드 패턴 (docs/decisions/0075)

const base: LocationPattern = {
  zoneCode: 'A',
  pattern: '{ZONE}-{ROW}-{LEVEL}',
  row: { from: 1, to: 2, digits: 2 },
  level: { from: 1, to: 2, digits: 2 },
  bay: null,
  cell: null,
}

describe('로케이션 코드 패턴', () => {
  it('열 → 연 → 단 순서로 0을 채워 만든다', () => {
    expect(expandLocationPattern(base).map((l) => l.code)).toEqual([
      'A-01-01',
      'A-01-02',
      'A-02-01',
      'A-02-02',
    ])
    const withBay = expandLocationPattern({
      ...base,
      pattern: '{ZONE}{ROW}{BAY}{LEVEL}',
      row: { from: 3, to: 3, digits: 1 },
      bay: { from: 1, to: 2, digits: 2 },
      level: { from: 1, to: 1, digits: 1 },
    })
    expect(withBay).toEqual([
      { code: 'A3011', rowNo: '3', bayNo: '01', levelNo: '1', cellNo: null },
      { code: 'A3021', rowNo: '3', bayNo: '02', levelNo: '1', cellNo: null },
    ])
    expect(countLocationPattern({ ...base, bay: { from: 1, to: 3, digits: 1 } })).toBe(12)
  })

  it('규칙: 모르는 토큰, 범위가 있는데 패턴에 없는 토큰, 자릿수 초과, 최대 개수 초과', () => {
    const issues = (p: Partial<LocationPattern>) => {
      const r = locationPatternSchema.safeParse({ ...base, ...p })
      return r.success ? [] : r.error.issues.map((i) => i.message)
    }
    expect(issues({})).toEqual([])
    expect(patternTokens('{ZONE}-{AISLE}')).toBeNull()
    expect(issues({ pattern: '{ZONE}-{AISLE}' })[0]).toContain('만 쓸 수 있습니다')
    expect(issues({ pattern: '{ZONE}-{ROW}' })[0]).toContain('{LEVEL}')
    expect(issues({ row: { from: 1, to: 100, digits: 2 } })[0]).toContain('자릿수')
    expect(
      issues({
        row: { from: 1, to: 100, digits: 3 },
        level: { from: 1, to: 51, digits: 2 },
      }).join(),
    ).toContain('5,000개')
    expect(issues({ pattern: '{ZONE}_{ROW}_{LEVEL}' })[0]).toContain('규칙')
  })

  it('한 칸 추가 코드 제안: 빈 칸은 빼고 구분자를 정리한다, 창고 구분자로 기본 패턴', () => {
    expect(suggestLocationCode('{ZONE}-{ROW}-{LEVEL}', { zone: 'b', row: '01', level: '02' })).toBe(
      'B-01-02',
    )
    expect(suggestLocationCode('{ZONE}-{ROW}-{LEVEL}', { row: '01' })).toBe('01')
    expect(defaultPattern('')).toBe('{ZONE}{ROW}{LEVEL}')
    expect(defaultPattern(null)).toBe('{ZONE}-{ROW}-{LEVEL}')
  })
})
