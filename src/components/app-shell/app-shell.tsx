import { cookies } from 'next/headers'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { NavAreaKey } from '@/config/navigation'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'

// 운영사 화면 · 화주 포털 공통 뼈대: 사이드바 + 상단 바 + 본문
export async function AppShell({
  area,
  children,
}: {
  area: NavAreaKey
  children: React.ReactNode
}) {
  // 사이드바 접힘 상태는 쿠키에 저장된다 → 다음 접속 때도 같은 상태로 그린다
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar area={area} />
      <SidebarInset>
        <AppHeader />
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
