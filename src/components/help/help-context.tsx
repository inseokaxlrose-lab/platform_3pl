'use client'

import { createContext, useContext } from 'react'
import type { ActionResult } from '@/lib/actions/result'
import type { HelpDocument } from '@/lib/help/parse-help'

export type LoadHelp = (input: { menuHref: string }) => Promise<ActionResult<HelpDocument>>

type HelpContextValue = {
  // 도움말 파일이 있는 메뉴 주소
  menuHrefs: ReadonlySet<string>
  // 도움말 불러오기 서버 액션 (레이아웃이 넘겨준다 → 부품은 서버 코드를 직접 부르지 않음)
  load: LoadHelp
}

const HelpContext = createContext<HelpContextValue | null>(null)

// 화면 도움말 보관함 (docs/decisions/0023)
export function HelpProvider({
  menuHrefs,
  load,
  children,
}: {
  menuHrefs: readonly string[]
  load: LoadHelp
  children: React.ReactNode
}) {
  return <HelpContext value={{ menuHrefs: new Set(menuHrefs), load }}>{children}</HelpContext>
}

// 보관함 밖(쇼케이스 등)에서는 null → 도움말 버튼을 그리지 않는다
export function useHelp() {
  return useContext(HelpContext)
}
