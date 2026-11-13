import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'

export const metadata: Metadata = {
  title: {
    template: '%s | 화주 포털',
    default: '화주 포털',
  },
}

// 화주 포털(/portal) 공통 틀: 사이드바 + 상단 바 + 본문
export default function PortalLayout({ children }: LayoutProps<'/portal'>) {
  return <AppShell area="portal">{children}</AppShell>
}
