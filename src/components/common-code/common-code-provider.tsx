'use client'

import { createContext, useContext } from 'react'
import type { CodeOption, CodeOptions } from '@/lib/common-code'

// 공통코드 공급자 (docs/decisions/0030)
// 화면 틀(AppShell)이 요청마다 공통코드 전체를 한 번 읽어 여기에 넣고, 화면의 CodeSelect 등이 꺼내 쓴다
// 관리 화면에서 코드를 고치면 router.refresh()로 새 목록이 다시 내려온다
const CommonCodeContext = createContext<CodeOptions>({})

export function CommonCodeProvider({
  options,
  children,
}: {
  options: CodeOptions
  children: React.ReactNode
}) {
  return <CommonCodeContext.Provider value={options}>{children}</CommonCodeContext.Provider>
}

const EMPTY: readonly CodeOption[] = []

// 그룹의 코드 목록 (사용 중지 코드 포함, 정렬 순서대로). 없는 그룹이면 빈 목록
export function useCodeOptions(group: string): readonly CodeOption[] {
  return useContext(CommonCodeContext)[group] ?? EMPTY
}
