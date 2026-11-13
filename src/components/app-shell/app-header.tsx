import { ThemeToggle } from '@/components/theme-toggle'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import type { NavAreaKey } from '@/config/navigation'
import type { CurrentUser } from '@/lib/session'
import { AppBreadcrumb } from './app-breadcrumb'
import { UserMenu } from './user-menu'

// 상단 바: 사이드바 접기 버튼 · 경로 표시 · 테마 전환 · 사용자 메뉴
export function AppHeader({ area, user }: { area: NavAreaKey; user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
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
  )
}
