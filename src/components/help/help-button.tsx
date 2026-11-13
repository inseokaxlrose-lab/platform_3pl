'use client'

import { CircleHelpIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { findActiveHref } from '@/components/app-shell/find-active-href'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { navigation } from '@/config/navigation'
import type { HelpDocument } from '@/lib/help/parse-help'
import { HelpContent } from './help-content'
import { useHelp } from './help-context'

const MENU_ITEMS = Object.values(navigation).flatMap((area) =>
  area.groups.flatMap((group) => group.items),
)

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; document: HelpDocument }
  | { status: 'error'; message: string }

// 페이지 헤더의 [? 도움말] 버튼: 지금 화면의 메뉴 도움말을 옆 패널로 보여준다 (0023)
// - 메뉴 목록과 자동 연결: 지금 주소에 해당하는 메뉴(하위 화면은 그 메뉴)의 도움말
// - 도움말 파일이 없는 화면에서는 버튼이 없다
// - 패널을 처음 열 때 불러온다 (평소 화면은 가볍게)
export function HelpButton() {
  const help = useHelp()
  const pathname = usePathname()
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  const menuHref = findActiveHref(pathname, MENU_ITEMS)
  if (!help || !menuHref || !help.menuHrefs.has(menuHref)) return null
  const { load } = help

  // 다른 화면으로 옮겨 오면 다시 불러온다
  const current: LoadState = loadedFor === menuHref ? state : { status: 'idle' }

  async function open() {
    if (!menuHref || (loadedFor === menuHref && state.status === 'loaded')) return
    setLoadedFor(menuHref)
    setState({ status: 'loading' })
    const result = await load({ menuHref })
    setState(
      result.ok
        ? { status: 'loaded', document: result.data }
        : { status: 'error', message: result.error.message },
    )
  }

  const title = current.status === 'loaded' ? current.document.title : '도움말'
  const summary = current.status === 'loaded' ? current.document.summary : null

  return (
    <Sheet onOpenChange={(isOpen) => isOpen && void open()}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <CircleHelpIcon />
          도움말
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>도움말: {title}</SheetTitle>
          <SheetDescription>{summary ?? '이 화면의 사용 방법입니다.'}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {current.status === 'loading' || current.status === 'idle' ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : current.status === 'error' ? (
            <p role="alert" className="text-sm text-destructive">
              {current.message}
            </p>
          ) : (
            <HelpContent document={current.document} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
