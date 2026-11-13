'use client'

import { createContext, useContext } from 'react'
import type { GridSettings } from './settings'

// 그리드 설정 보관함 꺼내기 (DataGrid가 사용)
// 서버 액션을 부르는 실제 보관함은 grid-settings-provider.tsx (레이아웃에서만 사용)

export type GridSettingsStore = {
  get: (gridId: string) => GridSettings | undefined
  save: (gridId: string, settings: GridSettings) => void
  reset: (gridId: string) => void
}

export const GridSettingsContext = createContext<GridSettingsStore | null>(null)

// 보관함이 없는 곳(/dev/grid 쇼케이스 등): 저장하지 않고 그 화면 안에서만 기억한다
const MEMORY_ONLY: GridSettingsStore = { get: () => undefined, save: () => {}, reset: () => {} }

export function useGridSettingsStore() {
  return useContext(GridSettingsContext) ?? MEMORY_ONLY
}
