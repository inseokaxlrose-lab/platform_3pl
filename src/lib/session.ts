import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { PermissionCode } from '@/config/permissions'
import { auth } from '@/lib/auth'
import { isOperatorActive } from '@/lib/operator/operator-status'
import { areaCodes } from '@/lib/permissions/compute-permissions'
import { loadUserPermissions } from '@/lib/permissions/load-user-permissions'
import { prisma } from '@/lib/prisma'
import { areaOf, homeOf, type Area, type UserTypeValue } from '@/lib/redirect'
import type { DataScope } from '@/lib/scope/data-scope'
import { loadDataScope } from '@/lib/scope/load-data-scope'
import { isActiveStatus } from '@/lib/status'

export type CurrentUser = {
  // 내부 키 (Better Auth는 글자로 주므로 bigint로 바꾼다)
  id: bigint
  name: string
  username: string
  userType: UserTypeValue
}

// 현재 로그인 사용자 (한 요청 안에서는 한 번만 조회: cache)
// 세션이 없거나, 사용 중지된 계정이거나, 운영사가 운영 중(ACTIVE)이 아니면 null → 로그인 상태가 아닌 것으로 본다
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || !isActiveStatus(session.user.status)) return null
  const user = session.user
  const current: CurrentUser = {
    id: BigInt(user.id),
    name: user.name,
    username: user.displayUsername ?? user.username ?? '',
    userType: user.userType as UserTypeValue,
  }
  // 운영사가 정지·해지되면 이미 로그인해 있던 사람도 다음 화면부터 막힌다 (플랫폼 관리자는 운영사가 없다)
  if (current.userType !== 'PLATFORM') {
    const row = await prisma.user.findUnique({
      where: { id: current.id },
      select: { operator: { select: { status: true } } },
    })
    if (!isOperatorActive(row?.operator?.status)) return null
  }
  return current
})

// ── 운영사 전환 (플랫폼 관리자가 운영사를 골라 그 운영사로 작업, 0039)
// 고른 운영사 키는 쿠키에 둔다. 쿠키는 누구나 바꿀 수 있으므로 매 요청 "플랫폼 관리자인지"를 확인한 뒤에만 쓴다
// (플랫폼 관리자는 어느 운영사로든 작업할 수 있으므로, 쿠키를 바꿔도 더 얻는 권한은 없다)
export const ACTING_OPERATOR_COOKIE = 'acting_operator'

export type ActingOperator = { id: bigint; name: string }

// 지금 작업 중인 운영사 (플랫폼 관리자가 아니거나 고르지 않았으면 null)
export const getActingOperator = cache(async (): Promise<ActingOperator | null> => {
  const user = await getCurrentUser()
  if (user?.userType !== 'PLATFORM') return null
  const raw = (await cookies()).get(ACTING_OPERATOR_COOKIE)?.value
  if (!raw || !/^\d{1,18}$/.test(raw)) return null
  return prisma.operator.findUnique({
    where: { id: BigInt(raw) },
    select: { id: true, name: true },
  })
})

// 영역(운영사 화면/포털/플랫폼) 입구 검사: 레이아웃에서 사용
// - 로그인 안 됨(또는 사용 중지·운영사 정지) → /login
// - 다른 영역 사용자 → 자기 영역 홈 (플랫폼 관리자는 운영사로 작업 중이면 운영사 화면에도 들어간다)
export async function requireUser(area: Area): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (areaOf(user.userType) === area) return user
  if (area === 'admin' && (await getActingOperator())) return user
  redirect(homeOf(user.userType))
}

// 현재 로그인 사용자의 최종 권한 (한 요청 안에서는 한 번만 계산: cache)
// 로그인 안 됨(또는 사용 중지)이면 빈 목록
// 플랫폼 관리자가 운영사로 작업 중이면 운영사 화면 권한 전체를 더한다 (사용자 결정, 0039)
export const getCurrentPermissions = cache(async (): Promise<ReadonlySet<PermissionCode>> => {
  const user = await getCurrentUser()
  if (!user) return new Set()
  const { codes } = await loadUserPermissions(user.id)
  if (user.userType === 'PLATFORM' && (await getActingOperator())) {
    return new Set([...codes, ...areaCodes('admin')])
  }
  return codes
})

// 화면(page.tsx)에서 권한 확인: 없으면 <AccessDenied />를 보여준다
// 예) if (!(await hasPermission('inbound.asn.read'))) return <AccessDenied />
export async function hasPermission(code: PermissionCode) {
  return (await getCurrentPermissions()).has(code)
}

// 현재 로그인 사용자의 데이터 범위 (한 요청 안에서는 한 번만 계산: cache)
// 로그인 안 됨이면 NONE (아무것도 볼 수 없음)
// 플랫폼 관리자: 운영사로 작업 중이면 그 운영사 전체, 아니면 운영사 데이터를 볼 수 없다
export const getCurrentScope = cache(async (): Promise<DataScope> => {
  const user = await getCurrentUser()
  if (!user) return { kind: 'NONE' }
  if (user.userType === 'PLATFORM') {
    const acting = await getActingOperator()
    return acting ? { kind: 'ALL', operatorId: acting.id } : { kind: 'NONE' }
  }
  return loadDataScope(user.id)
})
