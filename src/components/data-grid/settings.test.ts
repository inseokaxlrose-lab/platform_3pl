import { describe, expect, it } from 'vitest'
import {
  clampWidth,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseGridSettings,
  resolveColumnOrder,
  resolveHidden,
  resolveSorting,
  resolveWidths,
} from './settings'

const COLUMNS = [
  { id: 'code', hideable: false, sortable: true },
  { id: 'name', sortable: true },
  { id: 'qty' },
]

describe('그리드 설정 읽기', () => {
  it('올바른 값은 그대로, 모양이 깨진 값은 설정 없음으로 본다', () => {
    const valid = { hidden: ['qty'], density: 'comfortable', pageSize: 50 }
    expect(parseGridSettings(valid)).toEqual(valid)
    expect(parseGridSettings({ pageSize: 33 })).toEqual({}) // 고를 수 없는 건수
    expect(parseGridSettings({ density: 'huge' })).toEqual({})
    expect(parseGridSettings('not-an-object')).toEqual({})
    expect(parseGridSettings(null)).toEqual({})
  })
})

describe('화면의 현재 컬럼과 맞추기', () => {
  it('순서: 저장된 순서를 따르고, 없어진 컬럼은 버린다', () => {
    expect(resolveColumnOrder(['a', 'b', 'c'], ['c', 'gone', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })

  it('순서: 새로 생긴 컬럼은 기본 순서에서 앞 컬럼 바로 뒤에 들어간다', () => {
    // 기본 a,b,new,c / 저장 c,b,a → new는 b 뒤
    expect(resolveColumnOrder(['a', 'b', 'new', 'c'], ['c', 'b', 'a'])).toEqual([
      'c',
      'b',
      'new',
      'a',
    ])
    // 맨 앞에 새 컬럼
    expect(resolveColumnOrder(['first', 'a', 'b'], ['b', 'a'])).toEqual(['first', 'b', 'a'])
    // 저장값 없음 → 기본 순서
    expect(resolveColumnOrder(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('숨김: 숨길 수 없는 컬럼과 없어진 컬럼은 무시한다', () => {
    expect(resolveHidden(COLUMNS, ['code', 'qty', 'gone'])).toEqual(['qty'])
    expect(resolveHidden(COLUMNS)).toEqual([])
  })

  it('너비: 없어진 컬럼은 버리고, 최소·최대 범위로 보정한다', () => {
    expect(resolveWidths(COLUMNS, { code: 10, name: 5000, qty: 120.4, gone: 100 })).toEqual({
      code: MIN_COLUMN_WIDTH,
      name: MAX_COLUMN_WIDTH,
      qty: 120,
    })
    expect(clampWidth(200)).toBe(200)
  })

  it('정렬: 정렬할 수 없거나 없어진 컬럼은 버린다', () => {
    expect(
      resolveSorting(COLUMNS, [
        { id: 'qty', desc: false },
        { id: 'name', desc: true },
        { id: 'gone', desc: false },
      ]),
    ).toEqual([{ id: 'name', desc: true }])
  })
})
