import { cookies } from 'next/headers'
import { PermissionProvider } from '@/components/permission'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { NavAreaKey } from '@/config/navigation'
import type { PermissionCode } from '@/config/permissions'
import type { CurrentUser } from '@/lib/session'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'

// 운영사 화면 · 화주 포털 공통 뼈대: 사이드바 + 상단 바 + 본문
export async function AppShell({
  area,
  user,
  permissions,
  children,
}: {
  area: NavAreaKey
  // 레이아웃에서 requireUser로 확인한 로그인 사용자
  user: CurrentUser
  // 레이아웃에서 계산한 최종 권한 (메뉴·버튼 표시용)
  permissions: readonly PermissionCode[]
  children: React.ReactNode
}) {
  // 사이드바 접힘 상태는 쿠키에 저장된다 → 다음 접속 때도 같은 상태로 그린다
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    <PermissionProvider codes={permissions}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar area={area} />
        <SidebarInset>
          <AppHeader area={area} user={user} />
          <div className="flex-1 p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  )
}
