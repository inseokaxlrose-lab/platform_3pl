import 'server-only'
import { isPermissionCode } from '@/config/permissions'
import { prisma } from '@/lib/prisma'

// 등록·수정 화면의 선택지: 사용 중인 센터·화주사, 권한그룹(영역 포함)
export async function getUserFormOptions() {
  const [centers, shippers, groups] = await Promise.all([
    prisma.center.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.shipper.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.permissionGroup.findMany({
      select: { id: true, name: true, area: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { centers, shippers, groups }
}

export type UserFormOptions = Awaited<ReturnType<typeof getUserFormOptions>>

// 수정 화면용 사용자 한 건
export async function getUserForEdit(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayUsername: true,
      name: true,
      email: true,
      userType: true,
      isActive: true,
      shipperId: true,
      centers: { select: { centerId: true } },
      permissionGroups: { select: { groupId: true } },
    },
  })
  if (!user) return null
  return {
    id: user.id,
    username: user.displayUsername ?? user.username ?? '',
    name: user.name,
    // 내부용 주소는 화면에 보여주지 않는다
    email: user.email.endsWith('@users.local') ? '' : user.email,
    userType: user.userType,
    isActive: user.isActive,
    shipperId: user.shipperId ?? '',
    centerIds: user.centers.map((c) => c.centerId),
    permissionGroupIds: user.permissionGroups.map((g) => g.groupId),
  }
}

export type UserForEdit = NonNullable<Awaited<ReturnType<typeof getUserForEdit>>>

// 개별 권한 화면용: 저장된 그룹 권한 코드 + 사용자 추가·제외 목록
// 목록에 없는 옛 코드는 화면에 보이지 않는다 (계산에서도 무시되고, 다음 저장 때 정리된다)
export async function getUserOverrides(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      permissionGroups: {
        select: { group: { select: { permissions: { select: { permissionCode: true } } } } },
      },
      permissionOverrides: { select: { permissionCode: true, effect: true } },
    },
  })
  if (!user) return null
  const codesOf = (effect: 'GRANT' | 'DENY') =>
    user.permissionOverrides
      .filter((o) => o.effect === effect)
      .map((o) => o.permissionCode)
      .filter(isPermissionCode)
  return {
    groupCodes: [
      ...new Set(
        user.permissionGroups.flatMap(({ group }) =>
          group.permissions.map((p) => p.permissionCode),
        ),
      ),
    ].filter(isPermissionCode),
    grants: codesOf('GRANT'),
    denies: codesOf('DENY'),
  }
}

export type UserOverrides = NonNullable<Awaited<ReturnType<typeof getUserOverrides>>>
