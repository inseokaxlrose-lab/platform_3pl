import { describe, expect, it } from 'vitest'
import { formatClosedGroups, parseClosedGroups, parseSidebarTab } from './sidebar-tab'

describe('사이드바 쿠키 값', () => {
  it('탭: 모르는 값이면 전체', () => {
    expect(parseSidebarTab('favorites')).toBe('favorites')
    expect(parseSidebarTab('x')).toBe('all')
  })

  it('접어 둔 묶음: 한글 이름을 그대로 오가고, 망가진 값은 빈 목록', () => {
    expect(parseClosedGroups(formatClosedGroups(['기준정보', '재고']))).toEqual([
      '기준정보',
      '재고',
    ])
    expect(parseClosedGroups(undefined)).toEqual([])
    expect(parseClosedGroups('%E0%A4%A')).toEqual([])
    expect(parseClosedGroups(formatClosedGroups(['', '입고']))).toEqual(['입고'])
  })
})
