'use client'

import { useSyncExternalStore } from 'react'

// 지금 보고 있는 화면에 "저장하지 않은 변경"이 있는지 (docs/decisions/0069)
// - 입력 화면(useDirtyGuard)이 알리고, 메뉴 탭이 읽어서 ● 표시를 한다
// - 화면을 떠날 때 확인 창이 먼저 뜨므로 변경 중인 화면은 늘 하나뿐 → 값 하나로 충분하다
// - 메뉴 탭이 [×]로 보던 화면을 닫을 때도 같은 확인 창을 쓰도록, 확인 창을 여는 함수를 함께 둔다
// - 다른 메뉴로 가면 묻지 않고 작성 내용을 보관한다(0097) → "이 주소는 어느 메뉴인가"를 메뉴 탭이 알려 준다

let dirty = false
// 변경 중인 화면이 등록한 "이 주소로 떠나도 될지 묻기" 함수
let requestLeave: ((href: string) => void) | null = null
// 주소(경로) → 그 주소가 속한 메뉴 주소 (메뉴 탭이 등록, 없으면 null)
let menuOf: ((pathname: string) => string | null) | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setPageDirty(next: boolean) {
  if (dirty === next) return
  dirty = next
  emit()
}

export function setLeaveRequest(fn: ((href: string) => void) | null) {
  requestLeave = fn
}

export function setMenuResolver(fn: ((pathname: string) => string | null) | null) {
  menuOf = fn
}

// 두 주소가 서로 다른 메뉴인지 (모르면 false = 같은 메뉴로 보고 지금처럼 묻는다)
export function isOtherMenu(fromPathname: string, toPathname: string): boolean {
  if (!menuOf) return false
  const from = menuOf(fromPathname)
  const to = menuOf(toPathname)
  return from !== null && from !== to
}

// 변경 중이면 확인 창을 띄우고 true (이동은 확인 창이 한다), 아니면 false (부른 쪽이 바로 이동)
export function askBeforeLeave(href: string): boolean {
  if (!dirty || !requestLeave) return false
  requestLeave(href)
  return true
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePageDirty(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => dirty,
    () => false,
  )
}
