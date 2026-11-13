import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
// 한글 글꼴: 화면에 나온 글자가 포함된 조각 파일만 내려받는 분할 버전
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

// 코드·식별자 표시용 고정폭 글꼴 (본문 글꼴 Pretendard는 globals.css의 --font-sans)
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
    // suppressHydrationWarning: 다크 모드 클래스를 브라우저에서 html에 붙이므로 경고를 끈다
    <html lang="ko" className={`${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
