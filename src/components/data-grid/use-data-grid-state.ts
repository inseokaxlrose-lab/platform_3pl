'use client'

import { useState } from 'react'
import { useGridSettingsStore } from './grid-settings-context'
import { createDataGridState } from './state'
import type { DataGridState } from './types'

// 목록 화면의 그리드 상태: 저장된 개인 설정(한 페이지 건수·정렬)으로 시작한다
// 사용: const [state, setState] = useDataGridState('system-users')
// gridId는 <DataGrid id>와 같아야 한다
export function useDataGridState(gridId: string, initial: Partial<DataGridState> = {}) {
  const store = useGridSettingsStore()
  return useState<DataGridState>(() => {
    const saved = store.get(gridId)
    return createDataGridState({
      ...initial,
      ...(saved?.pageSize ? { pageSize: saved.pageSize } : {}),
      ...(saved?.sorting ? { sorting: saved.sorting } : {}),
    })
  })
}
