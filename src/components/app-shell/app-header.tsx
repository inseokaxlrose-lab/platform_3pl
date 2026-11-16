import { ThemeToggle } from '@/components/theme-toggle'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import type { NavAreaKey } from '@/config/navigation'
import type { CurrentUser } from '@/lib/session'
import { Suspense } from 'react'
import { AppBreadcrumb } from './app-breadcrumb'
import { MenuTabs } from './menu-tabs'
import { UserMenu } from './user-menu'

// 상단 바: 사이드바 접기 버튼 · 경로 표시 · 테마 전환 · 사용자 메뉴
// + 그 아래 메뉴 탭 줄 (0069). 둘을 함께 위에 고정한다 → 높이 3.5rem + 2.5rem = APP_TOP
export function AppHeader({ area, user }: { area: NavAreaKey; user: CurrentUser }) {
  return (
    <div className="sticky top-0 z-30 shrink-0">
      <header className="flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
        <SidebarTrigger className="-ml-1" aria-label="메뉴 접기/펴기" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-center"
        />
        <div className="min-w-0 flex-1">
          <AppBreadcrumb area={area} />
        </div>
        <ThemeToggle />
        <UserMenu user={user} />
      </header>
      {/* 주소 조건(useSearchParams)을 읽으므로 Suspense 안에 */}
      <Suspense fallback={<div className="h-10 border-b bg-background" />}>
        <MenuTabs area={area} />
      </Suspense>
    </div>
  )
}
