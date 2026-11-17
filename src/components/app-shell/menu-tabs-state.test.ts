import { describe, expect, it } from 'vitest'
import {
  closeAllMenuTabs,
  closeMenuTab,
  openMenuTab,
  parseMenuTabs,
  type MenuTab,
} from './menu-tabs-state'

// 메뉴 탭 계산 (0069)

const tab = (href: string, usedAt: number, url = href): MenuTab => ({ href, url, usedAt })

describe('메뉴 탭 열기', () => {
  it('없으면 맨 끝에 추가, 있으면 자리 그대로 주소·사용 순서만 바꾼다', () => {
    let tabs = openMenuTab([], '/a', '/a', 1)
    tabs = openMenuTab(tabs, '/b', '/b', 2)
    tabs = openMenuTab(tabs, '/a', '/a?q=x', 3)
    expect(tabs).toEqual([tab('/a', 3, '/a?q=x'), tab('/b', 2)])
  })

  it('최대 개수를 넘으면 방금 연 탭을 빼고 가장 오래 안 쓴 탭부터 닫는다', () => {
    const tabs = [tab('/a', 5), tab('/b', 1), tab('/c', 3)]
    expect(openMenuTab(tabs, '/d', '/d', 9, 3).map((t) => t.href)).toEqual(['/a', '/c', '/d'])
  })
})

describe('메뉴 탭 닫기', () => {
  const tabs = [tab('/a', 1), tab('/b', 2), tab('/c', 3)]

  it('닫은 뒤 갈 탭: 오른쪽 → 없으면 왼쪽 → 없으면 null(홈)', () => {
    expect(closeMenuTab(tabs, '/b')).toEqual({ tabs: [tabs[0], tabs[2]], next: tabs[2] })
    expect(closeMenuTab(tabs, '/c').next).toEqual(tabs[1])
    expect(closeMenuTab([tabs[0]], '/a')).toEqual({ tabs: [], next: null })
  })

  it('없는 탭을 닫으면 그대로', () => {
    expect(closeMenuTab(tabs, '/x')).toEqual({ tabs, next: null })
  })

  it('전체 닫기: 보던 탭만 남기거나(홈으로 옮긴 뒤 닫음), 보던 탭이 없으면 모두 닫는다', () => {
    expect(closeAllMenuTabs(tabs, '/b')).toEqual([tabs[1]])
    expect(closeAllMenuTabs(tabs, null)).toEqual([])
    expect(closeAllMenuTabs(tabs, '/x')).toEqual([])
  })
})

describe('저장한 탭 읽기', () => {
  it('모양이 틀리거나 메뉴 밖 주소인 줄은 버린다', () => {
    const raw = JSON.stringify([
      tab('/admin/items', 1, '/admin/items?q=a'),
      { href: '/admin/stock', url: 'https://evil.example', usedAt: 2 },
      { href: '/admin/x' },
      'nope',
    ])
    expect(parseMenuTabs(raw)).toEqual([tab('/admin/items', 1, '/admin/items?q=a')])
    expect(parseMenuTabs('{')).toEqual([])
    expect(parseMenuTabs(null)).toEqual([])
  })
})
