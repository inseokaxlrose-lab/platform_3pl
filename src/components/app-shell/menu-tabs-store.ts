'use client'

import { useSyncExternalStore } from 'react'
import type { NavAreaKey } from '@/config/navigation'
import {
  closeAllMenuTabs,
  closeMenuTab,
  openMenuTab,
  parseMenuTabs,
  type MenuTab,
} from './menu-tabs-state'

// 메뉴 탭 목록 보관 (docs/decisions/0069)
// - 브라우저 창(탭)마다 따로: sessionStorage → 새 창은 자기 탭 줄을 따로 갖고, 새로고침해도 남는다
// - 저장소를 쓸 수 없으면(사생활 보호 모드 등) 이 화면에서만 기억한다

const EMPTY: MenuTab[] = []
const cache = new Map<NavAreaKey, MenuTab[]>()
const listeners = new Set<() => void>()
const storageKey = (area: NavAreaKey) => `menu-tabs:${area}`

function read(area: NavAreaKey): MenuTab[] {
  const cached = cache.get(area)
  if (cached) return cached
  let tabs: MenuTab[] = []
  try {
    tabs = parseMenuTabs(sessionStorage.getItem(storageKey(area)))
  } catch {
    tabs = []
  }
  cache.set(area, tabs)
  return tabs
}

function write(area: NavAreaKey, tabs: MenuTab[]) {
  cache.set(area, tabs)
  try {
    sessionStorage.setItem(storageKey(area), JSON.stringify(tabs))
  } catch {
    // 저장 못 해도 이 화면에서는 계속 쓴다
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useMenuTabs(area: NavAreaKey): MenuTab[] {
  // 서버에서는 빈 목록 (브라우저 저장소를 읽을 수 없다) → 화면이 뜬 뒤 채워진다
  return useSyncExternalStore(
    subscribe,
    () => read(area),
    () => EMPTY,
  )
}

export function openTab(area: NavAreaKey, href: string, url: string) {
  const tabs = read(area)
  const current = tabs.find((tab) => tab.href === href)
  // 같은 주소를 다시 연 것뿐이면 그대로 (불필요한 다시 그리기 방지)
  if (current && current.url === url && tabs.length > 0) {
    const newest = Math.max(...tabs.map((tab) => tab.usedAt))
    if (current.usedAt === newest) return
  }
  write(area, openMenuTab(tabs, href, url, Date.now()))
}

// 닫은 뒤 갈 탭을 돌려준다 (null = 홈)
export function closeTab(area: NavAreaKey, href: string): MenuTab | null {
  const { tabs, next } = closeMenuTab(read(area), href)
  write(area, tabs)
  return next
}

// 전체 닫기: keep(보던 탭)만 남기고 모두 닫는다
export function closeAllTabs(area: NavAreaKey, keep: string | null) {
  write(area, closeAllMenuTabs(read(area), keep))
}
