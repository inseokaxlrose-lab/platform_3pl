'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

// 다크 모드 스크립트의 type: 서버에서 그릴 때만 실행되는 자바스크립트로 둔다
// - next-themes는 화면 깜빡임을 막으려고 <script>를 넣는다 (서버가 그린 HTML에서만 실행됨)
// - 브라우저가 화면을 새로 그리면(예: 확장 프로그램이 HTML을 바꿔 hydration이 실패) React 19가
//   "Encountered a script tag…" 경고를 낸다. 브라우저에서 만든 <script>는 어차피 실행되지 않으므로
//   그때는 데이터용 type(text/plain)으로 바꿔 경고만 없앤다 (동작 변화 없음)
// - next-themes 0.4.6 기준 라이브러리 자체 해결책 없음. 고쳐진 버전이 나오면 이 처리를 지운다
const scriptProps = {
  type: typeof window === 'undefined' ? 'text/javascript' : 'text/plain',
}

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
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  )
}
