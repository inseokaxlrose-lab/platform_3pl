import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { PermissionCode } from '@/config/permissions'
import { auth } from '@/lib/auth'
import { loadUserPermissions } from '@/lib/permissions/load-user-permissions'
import { areaOf, homeOf, type Area, type UserTypeValue } from '@/lib/redirect'

export type CurrentUser = {
  id: string
  name: string
  username: string
  userType: UserTypeValue
}

// 현재 로그인 사용자 (한 요청 안에서는 한 번만 조회: cache)
// 세션이 없거나 사용 중지된 계정이면 null → 로그인 상태가 아닌 것으로 본다
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || !session.user.isActive) return null
  const user = session.user
  return {
    id: user.id,
    name: user.name,
    username: user.displayUsername ?? user.username ?? '',
    userType: user.userType as UserTypeValue,
  }
})

// 영역(운영사 화면/포털) 입구 검사: 레이아웃에서 사용
// - 로그인 안 됨(또는 사용 중지) → /login
// - 다른 영역 사용자 → 자기 영역 홈
export async function requireUser(area: Area): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (areaOf(user.userType) !== area) redirect(homeOf(user.userType))
  return user
}

// 현재 로그인 사용자의 최종 권한 (한 요청 안에서는 한 번만 계산: cache)
// 로그인 안 됨(또는 사용 중지)이면 빈 목록
export const getCurrentPermissions = cache(async (): Promise<ReadonlySet<PermissionCode>> => {
  const user = await getCurrentUser()
  if (!user) return new Set()
  return (await loadUserPermissions(user.id)).codes
})

// 화면(page.tsx)에서 권한 확인: 없으면 <AccessDenied />를 보여준다
// 예) if (!(await hasPermission('inbound.asn.read'))) return <AccessDenied />
export async function hasPermission(code: PermissionCode) {
  return (await getCurrentPermissions()).has(code)
}
