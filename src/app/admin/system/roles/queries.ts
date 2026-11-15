import 'server-only'
import { ALL_PERMISSION_CODES, isPermissionCode } from '@/config/permissions'
import { prisma } from '@/lib/prisma'

// 수정 화면용: 권한그룹 한 건 (화면에서 hasPermission으로 확인한 뒤 호출)
export async function getPermissionGroup(id: bigint) {
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

  // DB는 순서를 보장하지 않으므로 권한 정의 순서(메뉴 → 동작)로 맞춘다 (모르는 옛 코드는 뒤로)
  const order = (code: string) => {
    const index = (ALL_PERMISSION_CODES as readonly string[]).indexOf(code)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  const codes = group.permissions.map((p) => p.permissionCode).sort((a, b) => order(a) - order(b))
  return {
    // 화면으로 보낼 값이라 키는 글자로
    id: String(group.id),
    name: group.name,
    area: group.area,
    description: group.description ?? '',
    userCount: group._count.users,
    permissionCodes: codes.filter(isPermissionCode),
    // 목록에서 사라진 옛 코드: 화면에 "정리 필요"로 알리고, 저장하면 정리된다
    obsoleteCodes: codes.filter((code) => !isPermissionCode(code)),
  }
}
