import { describe, expect, it } from 'vitest'
import {
  codesFilter,
  dateRangeFilter,
  digitsFilter,
  numberRangeFilter,
  textFilter,
  statusWhere,
  ynFilter,
} from './list-filters'

describe('목록 검색 조건 해석', () => {
  it('글자·번호·코드·예/아니오: 비어 있으면 조건 없음', () => {
    const f = { name: ' 이천 ', phone: '031-123', codes: 'A, B,', yn: 'N', empty: '' }
    expect(textFilter(f, 'name')).toEqual({ contains: '이천', mode: 'insensitive' })
    expect(textFilter(f, 'empty')).toBeUndefined()
    expect(digitsFilter(f, 'phone')).toEqual({ contains: '031123' })
    expect(digitsFilter(f, 'none')).toBeUndefined()
    expect(codesFilter(f, 'codes')).toEqual({ in: ['A', 'B'] })
    expect(codesFilter(f, 'empty')).toBeUndefined()
    expect(ynFilter(f, 'yn')).toBe('N')
    expect(ynFilter({ yn: 'Y' }, 'yn')).toBe('Y')
    expect(ynFilter({ yn: 'all' }, 'yn')).toBeUndefined()
  })

  it('기간은 한국 날짜 기준, 종료일 하루 전체 포함, 한쪽만 있어도 된다', () => {
    expect(dateRangeFilter({ d: '2026-11-01~2026-11-30' }, 'd')).toEqual({
      gte: new Date('2026-10-31T15:00:00Z'),
      lt: new Date('2026-11-30T15:00:00Z'),
    })
    expect(dateRangeFilter({ d: '~2026-11-30' }, 'd')).toEqual({
      lt: new Date('2026-11-30T15:00:00Z'),
    })
    expect(dateRangeFilter({ d: 'nope~' }, 'd')).toBeUndefined()
  })

  it('숫자 범위', () => {
    expect(numberRangeFilter({ n: '10~100' }, 'n')).toEqual({ gte: 10, lte: 100 })
    expect(numberRangeFilter({ n: '~5' }, 'n')).toEqual({ lte: 5 })
    expect(numberRangeFilter({ n: 'a~' }, 'n')).toBeUndefined()
  })

  it('상태: ACTIVE·INACTIVE만 조건, 전체·모르는 값은 조건 없음', () => {
    expect(statusWhere({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' })
    expect(statusWhere({ status: 'INACTIVE' })).toEqual({ status: 'INACTIVE' })
    expect(statusWhere({ status: 'all' })).toEqual({})
    expect(statusWhere({})).toEqual({})
  })
})
