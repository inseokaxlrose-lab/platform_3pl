import 'server-only'
import { cookies } from 'next/headers'
import { ACTING_OPERATOR_COOKIE } from '@/lib/session'

// 운영사 전환 쿠키 쓰기·지우기 (읽기와 검증은 session.ts getActingOperator, 0039)
// httpOnly: 브라우저 스크립트가 읽지 못하게 / sameSite lax: 다른 사이트에서 보내는 요청에 붙지 않게
export async function setActingOperatorCookie(operatorId: bigint) {
  ;(await cookies()).set(ACTING_OPERATOR_COOKIE, String(operatorId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 브라우저를 닫으면 사라진다 (세션 쿠키) — 전환 상태가 오래 남지 않게
  })
}

export async function clearActingOperatorCookie() {
  ;(await cookies()).delete(ACTING_OPERATOR_COOKIE)
}
