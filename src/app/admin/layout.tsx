import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'

export const metadata: Metadata = {
  title: {
    template: '%s | 운영사 화면',
    default: '운영사 화면',
  },
}

// 운영사 화면(/admin) 공통 틀: 사이드바 + 상단 바 + 본문
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return <AppShell area="admin">{children}</AppShell>
}
