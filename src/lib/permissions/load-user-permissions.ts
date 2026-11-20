import 'server-only'
import { prisma } from '@/lib/prisma'
import { isActiveStatus } from '@/lib/status'
import { computePermissions, type PermissionResult } from './compute-permissions'
import { toValue } from '@/lib/db-value'
import { USER_TYPE_VALUES } from '@/config/db-codes'

// 사용자의 최종 권한: DB에서 그룹 권한·사용자 추가/제외를 한 번에 읽어 계산한다
// 사용자가 없으면 권한 없음
export async function loadUserPermissions(userId: bigint): Promise<PermissionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      userType: true,
      status: true,
      permissionGroups: {
        select: { group: { select: { permissions: { select: { permissionCode: true } } } } },
      },
      permissionOverrides: { select: { permissionCode: true, effect: true } },
    },
  })
  if (!user) return { codes: new Set(), ignored: [] }

  return computePermissions({
    userType: toValue(USER_TYPE_VALUES, user.userType),
    isActive: isActiveStatus(user.status),
    groupCodes: user.permissionGroups.flatMap(({ group }) =>
      group.permissions.map((p) => p.permissionCode),
    ),
    grants: user.permissionOverrides
      .filter((o) => o.effect === 'GRANT')
      .map((o) => o.permissionCode),
    denies: user.permissionOverrides
      .filter((o) => o.effect === 'DENY')
      .map((o) => o.permissionCode),
  })
}
