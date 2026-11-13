import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { loadUserGridSettings } from '@/lib/grid/grid-settings'
import { loadFavoriteMenus } from '@/lib/navigation/favorites'
import { getCurrentPermissions, requireUser } from '@/lib/session'

export const metadata: Metadata = {
  title: {
    template: '%s | 운영사 화면',
    default: '운영사 화면',
  },
}

// 운영사 화면(/admin) 공통 틀: 사이드바 + 상단 바 + 본문
// 들어오기 전에 로그인·사용 여부·영역을 검사한다 (아니면 로그인 화면이나 자기 영역으로 이동)
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const user = await requireUser('admin')
  const [permissions, gridSettings, favoriteMenus] = await Promise.all([
    getCurrentPermissions(),
    loadUserGridSettings(user.id),
    loadFavoriteMenus(user.id),
  ])
  return (
    <AppShell
      area="admin"
      user={user}
      permissions={[...permissions]}
      gridSettings={gridSettings}
      favoriteMenus={favoriteMenus}
    >
      {children}
    </AppShell>
  )
}
