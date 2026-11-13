// 개발용 시드: npm run db:seed (여러 번 실행해도 안전)
// - "슈퍼 관리자" 권한그룹: 운영사 화면의 모든 권한 (실행할 때마다 최신 권한 목록으로 맞춘다)
// - 슈퍼 계정: .env의 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (비밀번호는 코드에 두지 않는다)
//   이미 있는 계정의 비밀번호는 덮어쓰지 않는다
import 'dotenv/config'
import {
  ALL_PERMISSION_CODES,
  PERMISSION_MENUS,
  type PermissionMenu,
} from '../src/config/permissions'
import { prisma } from '../src/lib/prisma'
import { createUserAccount } from '../src/lib/users/create-user-account'

const SUPER_GROUP_NAME = '슈퍼 관리자'

// 운영사 화면 영역의 모든 권한 코드
const adminCodes = ALL_PERMISSION_CODES.filter((code) => {
  const menu = code.slice(0, code.lastIndexOf('.')) as PermissionMenu
  return PERMISSION_MENUS[menu].area === 'admin'
})

async function seedSuperGroup() {
  const group = await prisma.permissionGroup.upsert({
    where: { name: SUPER_GROUP_NAME },
    create: { name: SUPER_GROUP_NAME, description: '운영사 화면의 모든 권한 (시드가 관리)' },
    update: {},
  })
  // 권한 목록을 최신 코드 목록과 똑같이 맞춘다 (새 메뉴 추가 시 시드만 다시 실행)
  await prisma.$transaction([
    prisma.permissionGroupPermission.deleteMany({ where: { groupId: group.id } }),
    prisma.permissionGroupPermission.createMany({
      data: adminCodes.map((permissionCode) => ({ groupId: group.id, permissionCode })),
    }),
  ])
  return group
}

async function seedSuperAdmin(groupId: string) {
  const username = (process.env.SEED_ADMIN_USERNAME ?? 'admin').toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!password) {
    throw new Error('SEED_ADMIN_PASSWORD가 .env에 없습니다. .env.example을 참고해 추가해 주세요.')
  }

  let user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    user = await createUserAccount({
      username,
      password,
      name: '슈퍼 관리자',
      userType: 'OPERATOR',
    })
    console.log(`슈퍼 계정 생성: ${username}`)
  } else {
    console.log(`슈퍼 계정 이미 있음: ${username} (비밀번호는 그대로)`)
  }
  if (user.userType !== 'OPERATOR') {
    throw new Error(`'${username}' 계정이 운영사 유형이 아니라 슈퍼 계정으로 쓸 수 없습니다.`)
  }

  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } })
  await prisma.userPermissionGroup.upsert({
    where: { userId_groupId: { userId: user.id, groupId } },
    create: { userId: user.id, groupId },
    update: {},
  })
}

async function main() {
  const group = await seedSuperGroup()
  console.log(`'${SUPER_GROUP_NAME}' 권한그룹: 권한 ${adminCodes.length}개`)
  await seedSuperAdmin(group.id)
}

main()
  .catch((error) => {
    console.error('시드 실패:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
