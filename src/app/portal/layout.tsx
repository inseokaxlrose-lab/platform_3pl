import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | 화주 포털',
    default: '화주 포털',
  },
}

// 화주 포털(/portal) 공통 틀
// 사이드바·상단 바 디자인은 M0.5 "앱 레이아웃"에서 만든다
export default function PortalLayout({ children }: LayoutProps<'/portal'>) {
  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="flex h-14 items-center border-b border-border px-6">
        <span className="font-semibold">화주 포털</span>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
