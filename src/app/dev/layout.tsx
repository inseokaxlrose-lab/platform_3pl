import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: {
    template: '%s | 개발용',
    default: '개발용',
  },
}

// /dev 아래 화면(디자인 견본, 그리드 쇼케이스)은 개발 중에만 연다
export default function DevLayout({ children }: LayoutProps<'/dev'>) {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  return <div className="flex flex-1 flex-col bg-background text-foreground">{children}</div>
}
