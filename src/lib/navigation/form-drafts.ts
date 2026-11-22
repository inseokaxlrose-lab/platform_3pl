'use client'

import { useSyncExternalStore } from 'react'

// 작성 중 내용 임시 보관 (docs/decisions/0097)
// - 입력 화면에서 저장하지 않고 다른 메뉴 탭으로 가도, 돌아오면 이어서 쓸 수 있게 입력값을 보관한다
// - 브라우저 창마다 따로(sessionStorage): 창을 닫으면 사라지고, 새로고침해도 남는다
// - 열쇠는 화면 주소(경로): 같은 품목 수정 화면이면 같은 서랍
// - 로그아웃·로그인 화면에서 모두 비운다 (같은 창에서 다른 사람이 로그인해도 남의 작성 내용이 보이지 않게)

const PREFIX = 'form-draft:'

export type FormDraft = {
  // 보관한 입력값 (입력 화면의 값 모양 그대로, JSON으로 바꿀 수 있는 값만)
  value: unknown
  // 작성을 시작할 때 불러온 버전 — 돌아왔을 때 화면의 버전과 다르면 그 사이 누가 고친 것
  version: number | null
  // 보관한 때 (안내 문구용)
  savedAt: string
}

const listeners = new Set<() => void>()
// 보관된 화면 주소 목록 (정렬해 이은 글자 — 같은 내용이면 같은 값이라 다시 그리지 않는다)
let snapshot: string | null = null

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    // 저장소를 막아 둔 브라우저: 보관하지 않는다 (예전처럼 떠날 때 확인 창)
    return null
  }
}

function emit() {
  snapshot = null
  for (const listener of listeners) listener()
}

function keysOf(store: Storage) {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key?.startsWith(PREFIX)) keys.push(key)
  }
  return keys
}

export function readDraft(path: string): FormDraft | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + path)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FormDraft>
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) return null
    return {
      value: parsed.value,
      version: typeof parsed.version === 'number' ? parsed.version : null,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    }
  } catch {
    return null
  }
}

// 보관에 성공하면 true (저장소가 없거나 가득 차면 false)
export function writeDraft(path: string, draft: Omit<FormDraft, 'savedAt'>): boolean {
  const store = storage()
  if (!store) return false
  try {
    const had = store.getItem(PREFIX + path) !== null
    store.setItem(PREFIX + path, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }))
    // 값만 바뀌면 목록은 그대로 → 알리지 않는다 (글자 하나마다 탭 줄을 다시 그리지 않게)
    if (!had) emit()
    return true
  } catch {
    return false
  }
}

export function removeDraft(path: string) {
  const store = storage()
  if (!store) return
  try {
    if (store.getItem(PREFIX + path) === null) return
    store.removeItem(PREFIX + path)
    emit()
  } catch {
    // 지우지 못해도 화면 동작에는 지장 없다
  }
}

// 로그아웃·로그인 화면: 이 창에 보관한 작성 내용을 모두 버린다
export function clearAllDrafts() {
  const store = storage()
  if (!store) return
  try {
    for (const key of keysOf(store)) store.removeItem(key)
    emit()
  } catch {
    // 무시
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  if (snapshot === null) {
    const store = storage()
    snapshot = store
      ? keysOf(store)
          .map((key) => key.slice(PREFIX.length))
          .sort()
          .join('\n')
      : ''
  }
  return snapshot
}

// 작성 내용을 보관해 둔 화면 주소들 (메뉴 탭의 ● 표시용). 서버에서는 빈 목록
export function useDraftPaths(): ReadonlySet<string> {
  const joined = useSyncExternalStore(subscribe, getSnapshot, () => '')
  return new Set(joined ? joined.split('\n') : [])
}
