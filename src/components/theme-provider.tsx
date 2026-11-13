'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

// 라이트/다크 모드 관리
// - html에 'dark' 클래스를 붙였다 뗐다 하며, 선택값은 브라우저에 기억된다
// - 기본값은 운영체제 설정을 따른다
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
