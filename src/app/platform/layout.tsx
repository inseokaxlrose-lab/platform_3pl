import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { loadUserGridSettings } from '@/lib/grid/grid-settings'
import { loadFavoriteMenus } from '@/lib/navigation/favorites'
import { getCurrentPermissions, requireUser } from '@/lib/session'

export const metadata: Metadata = {
  title: {
    template: '%s | 플랫폼',
    default: '플랫폼',
  },
}

// 플랫폼 화면(/platform) 공통 틀: 플랫폼 관리자만 (0039)
// 들어오기 전에 로그인·사용 여부·영역을 검사한다 (아니면 로그인 화면이나 자기 영역으로 이동)
export default async function PlatformLayout({ children }: LayoutProps<'/platform'>) {
  const user = await requireUser('platform')
  const [permissions, gridSettings, favoriteMenus] = await Promise.all([
    getCurrentPermissions(),
    loadUserGridSettings(user.id),
    loadFavoriteMenus(user.id),
  ])
  return (
    <AppShell
      area="platform"
      user={user}
      permissions={[...permissions]}
      gridSettings={gridSettings}
      favoriteMenus={favoriteMenus}
    >
      {children}
    </AppShell>
  )
}
