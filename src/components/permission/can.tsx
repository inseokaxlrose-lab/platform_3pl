'use client'

import type { PermissionCode } from '@/config/permissions'
import { usePermission } from './permission-provider'

// 권한이 있을 때만 안쪽을 보여준다 (버튼 숨김)
// 예) <Can permission="inbound.asn.close"><Button>잔량 마감</Button></Can>
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionCode
  children: React.ReactNode
  // 권한이 없을 때 대신 보여줄 것 (기본: 아무것도)
  fallback?: React.ReactNode
}) {
  const { can } = usePermission()
  return can(permission) ? children : fallback
}
