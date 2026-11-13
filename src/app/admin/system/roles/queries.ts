import 'server-only'
import { isPermissionCode } from '@/config/permissions'
import { prisma } from '@/lib/prisma'

// 수정 화면용: 권한그룹 한 건 (화면에서 hasPermission으로 확인한 뒤 호출)
export async function getPermissionGroup(id: string) {
  const group = await prisma.permissionGroup.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      area: true,
      description: true,
      permissions: { select: { permissionCode: true } },
      _count: { select: { users: true } },
    },
  })
  if (!group) return null

  const codes = group.permissions.map((p) => p.permissionCode)
  return {
    id: group.id,
    name: group.name,
    area: group.area,
    description: group.description ?? '',
    userCount: group._count.users,
    permissionCodes: codes.filter(isPermissionCode),
    // 목록에서 사라진 옛 코드: 화면에 "정리 필요"로 알리고, 저장하면 정리된다
    obsoleteCodes: codes.filter((code) => !isPermissionCode(code)),
  }
}
