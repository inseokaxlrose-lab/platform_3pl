import { vi } from 'vitest'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'

// 서버 액션 테스트용 로그인 흉내 (테스트 파일에서 vi.mock('@/lib/session', …)을 먼저 한다)
export function signInAs(
  scope: DataScope,
  codes: readonly PermissionCode[] = ALL_PERMISSION_CODES,
  username = 'boss',
) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: username,
    username,
    userType:
      scope.kind === 'SHIPPER' ? 'SHIPPER' : scope.kind === 'CENTERS' ? 'CENTER' : 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}
