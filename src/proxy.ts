import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

// 입구 안내원: 로그인 쿠키가 아예 없으면 화면을 만들기 전에 바로 로그인 화면으로 보낸다
// 쿠키가 "있는지"만 보는 빠른 1차 확인이다. 진짜 검사(세션·사용 여부·영역)는 레이아웃의 requireUser가 한다
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next()

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
}
