import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { getCurrentPermissions, requireUser } from '@/lib/session'

export const metadata: Metadata = {
  title: {
    template: '%s | 화주 포털',
    default: '화주 포털',
  },
}

// 화주 포털(/portal) 공통 틀: 사이드바 + 상단 바 + 본문
// 들어오기 전에 로그인·사용 여부·영역을 검사한다 (아니면 로그인 화면이나 자기 영역으로 이동)
export default async function PortalLayout({ children }: LayoutProps<'/portal'>) {
  const user = await requireUser('portal')
  const permissions = await getCurrentPermissions()
  return (
    <AppShell area="portal" user={user} permissions={[...permissions]}>
      {children}
    </AppShell>
  )
}
