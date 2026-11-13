import { cookies } from 'next/headers'
import { GridSettingsProvider } from '@/components/data-grid'
import type { GridSettings } from '@/components/data-grid/settings'
import { PermissionProvider } from '@/components/permission'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { NavAreaKey } from '@/config/navigation'
import type { PermissionCode } from '@/config/permissions'
import { setFavoriteMenuAction } from '@/lib/navigation/favorite-actions'
import type { CurrentUser } from '@/lib/session'
import { AppHeader } from './app-header'
import { AppSidebar, SIDEBAR_TAB_COOKIE } from './app-sidebar'

// 운영사 화면 · 화주 포털 공통 뼈대: 사이드바 + 상단 바 + 본문
export async function AppShell({
  area,
  user,
  permissions,
  gridSettings,
  favoriteMenus,
  children,
}: {
  area: NavAreaKey
  // 레이아웃에서 requireUser로 확인한 로그인 사용자
  user: CurrentUser
  // 레이아웃에서 계산한 최종 권한 (메뉴·버튼 표시용)
  permissions: readonly PermissionCode[]
  // 레이아웃에서 읽은 사용자별 그리드 설정 (그리드 이름 → 설정, 0021)
  gridSettings: Record<string, GridSettings>
  // 사이드바 즐겨찾기 메뉴 주소 (추가한 순서, 0022)
  favoriteMenus: string[]
  children: React.ReactNode
}) {
  // 사이드바 접힘 상태는 쿠키에 저장된다 → 다음 접속 때도 같은 상태로 그린다
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'
  // 사이드바 탭도 마지막으로 연 탭으로 그린다
  const initialTab =
    cookieStore.get(SIDEBAR_TAB_COOKIE)?.value === 'favorites' ? 'favorites' : 'all'

  return (
    <PermissionProvider codes={permissions}>
      <GridSettingsProvider initial={gridSettings}>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar
            area={area}
            favorites={favoriteMenus}
            initialTab={initialTab}
            onToggleFavorite={setFavoriteMenuAction}
          />
          <SidebarInset>
            <AppHeader area={area} user={user} />
            <div className="flex-1 p-6">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </GridSettingsProvider>
    </PermissionProvider>
  )
}
