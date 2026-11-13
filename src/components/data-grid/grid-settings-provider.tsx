'use client'

import { useEffect, useMemo, useRef } from 'react'
import { resetGridSettingsAction, saveGridSettingsAction } from '@/lib/grid/grid-settings-actions'
import { GridSettingsContext, type GridSettingsStore } from './grid-settings-context'
import type { GridSettings } from './settings'

// 저장을 미루는 시간: 이 시간 안에 또 바뀌면 마지막 값만 한 번 저장한다
// (너비를 끌거나 순서를 여러 번 바꿀 때 매번 서버에 보내지 않기 위해)
export const SAVE_DELAY_MS = 500

// 로그인 사용자의 그리드 설정 보관함 (레이아웃이 DB에서 한 번 읽어 넘겨준다, 0021)
// - 화면 이동 후 다시 돌아와도 최신 값을 쓰도록, 저장한 값은 이 보관함에도 기억한다
// - 저장 실패는 화면을 막지 않는다 (개인 편의 설정이라 서버 기록만 남김)
export function GridSettingsProvider({
  initial,
  children,
}: {
  initial: Record<string, GridSettings>
  children: React.ReactNode
}) {
  const latest = useRef<Record<string, GridSettings | undefined>>({ ...initial })
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // 화면을 떠날 때 남은 저장은 바로 보낸다
  useEffect(() => {
    // 두 객체 모두 내용만 바뀌고 객체 자체는 그대로다
    const pending = timers.current
    const values = latest.current
    return () => {
      for (const [gridId, timer] of pending) {
        clearTimeout(timer)
        const settings = values[gridId]
        if (settings) void saveGridSettingsAction({ gridId, settings })
      }
      pending.clear()
    }
  }, [])

  const store = useMemo<GridSettingsStore>(
    () => ({
      get: (gridId) => latest.current[gridId],
      save: (gridId, settings) => {
        latest.current[gridId] = settings
        clearTimeout(timers.current.get(gridId))
        timers.current.set(
          gridId,
          setTimeout(() => {
            timers.current.delete(gridId)
            void saveGridSettingsAction({ gridId, settings }).then((result) => {
              if (!result.ok) console.warn(`[grid-settings:${gridId}]`, result.error.message)
            })
          }, SAVE_DELAY_MS),
        )
      },
      reset: (gridId) => {
        latest.current[gridId] = undefined
        clearTimeout(timers.current.get(gridId))
        timers.current.delete(gridId)
        void resetGridSettingsAction({ gridId })
      },
    }),
    [],
  )

  return <GridSettingsContext value={store}>{children}</GridSettingsContext>
}
