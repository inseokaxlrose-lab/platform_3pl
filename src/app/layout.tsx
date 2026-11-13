import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// 탭 제목: 하위 화면이 title을 정하면 '화면이름 | 3PL 관리 플랫폼' 형식으로 표시
export const metadata: Metadata = {
  title: {
    template: '%s | 3PL 관리 플랫폼',
    default: '3PL 관리 플랫폼',
  },
  description: '3PL 운영사·화주사를 위한 입고·재고 관리 플랫폼',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
