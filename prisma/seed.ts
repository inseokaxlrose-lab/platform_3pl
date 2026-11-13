// 개발용 시드: npm run db:seed (여러 번 실행해도 안전)
// - 역할별 권한그룹 4개: 실행할 때마다 prisma/seed-roles.ts 정의와 똑같이 맞춘다
// - 예시 센터·화주사 (코드 기준으로 없을 때만 만든다. 센터·화주사 관리 화면은 M2·M3)
// - 슈퍼 계정: .env의 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (비밀번호는 코드에 두지 않는다)
// - 예시 운영사 정보 (아직 없을 때만, 사업자번호는 검증번호 규칙으로 만든 가상 번호)
// - 역할별 견본 계정 4개: .env의 SEED_SAMPLE_PASSWORD (비어 있거나 운영 환경이면 건너뛴다)
// 이미 있는 계정은 비밀번호·소속을 덮어쓰지 않는다 (화면에서 바꾼 값을 지키기 위해)
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { createUserAccount } from '../src/lib/users/create-user-account'
import { SAMPLE_ACCOUNTS, SEED_GROUPS, SUPER_GROUP_NAME } from './seed-roles'

// 권한그룹을 만들고, 권한 목록을 정의와 똑같이 맞춘다 (새 메뉴 추가 시 시드만 다시 실행)
// 돌려주는 값: 그룹 이름 → id
async function seedGroups() {
  const ids = new Map<string, string>()
  for (const definition of SEED_GROUPS) {
    const group = await prisma.permissionGroup.upsert({
      where: { name: definition.name },
      create: { name: definition.name, area: definition.area, description: definition.description },
      update: { area: definition.area, description: definition.description },
    })
    const codes = [...new Set(definition.codes)]
    await prisma.$transaction([
      prisma.permissionGroupPermission.deleteMany({ where: { groupId: group.id } }),
      prisma.permissionGroupPermission.createMany({
        data: codes.map((permissionCode) => ({ groupId: group.id, permissionCode })),
      }),
    ])
    ids.set(definition.name, group.id)
    console.log(`권한그룹 '${definition.name}': 권한 ${codes.length}개`)
  }
  return ids
}

async function linkGroup(userId: string, groupId: string) {
  await prisma.userPermissionGroup.upsert({
    where: { userId_groupId: { userId, groupId } },
    create: { userId, groupId },
    update: {},
  })
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
  await linkGroup(user.id, groupId)
}

// 역할별 견본 계정: 없을 때만 만든다
async function seedSampleAccounts(groupIds: Map<string, string>) {
  if (process.env.NODE_ENV === 'production') {
    console.log('견본 계정: 운영 환경이라 건너뜀')
    return
  }
  const password = process.env.SEED_SAMPLE_PASSWORD
  if (!password) {
    console.log('견본 계정: SEED_SAMPLE_PASSWORD가 비어 있어 건너뜀 (.env.example 참고)')
    return
  }

  for (const account of SAMPLE_ACCOUNTS) {
    if (await prisma.user.findUnique({ where: { username: account.username } })) {
      console.log(`견본 계정 이미 있음: ${account.username} (그대로 둠)`)
      continue
    }
    const centers = await prisma.center.findMany({
      where: { code: { in: account.centerCodes ?? [] } },
      select: { id: true },
    })
    const shipper = account.shipperCode
      ? await prisma.shipper.findUniqueOrThrow({ where: { code: account.shipperCode } })
      : null

    await createUserAccount({
      username: account.username,
      password,
      name: account.name,
      userType: account.userType,
      centerIds: centers.map((c) => c.id),
      shipperId: shipper?.id,
      permissionGroupIds: [groupIds.get(account.group)!],
    })
    console.log(`견본 계정 생성: ${account.username} (${account.group})`)
  }
}

const SAMPLE_CENTERS = [
  { code: 'ICN', name: '이천센터' },
  { code: 'GMH', name: '김해센터' },
]
const SAMPLE_SHIPPERS = [
  { code: 'GANA', name: '가나식품' },
  { code: 'DARA', name: '다라전자' },
]

// 예시 조직: 이미 있으면 건드리지 않는다 (화면에서 바꾼 이름을 덮어쓰지 않기 위해)
async function seedSampleOrganizations() {
  for (const center of SAMPLE_CENTERS) {
    await prisma.center.upsert({ where: { code: center.code }, create: center, update: {} })
  }
  for (const shipper of SAMPLE_SHIPPERS) {
    await prisma.shipper.upsert({ where: { code: shipper.code }, create: shipper, update: {} })
  }
  console.log(`예시 센터 ${SAMPLE_CENTERS.length}곳 · 화주사 ${SAMPLE_SHIPPERS.length}곳 확인`)
}

// 예시 운영사 정보: 없을 때만 만든다 (화면에서 입력한 실제 정보를 덮어쓰지 않기 위해)
async function seedSampleCompany() {
  const exists = await prisma.company.findUnique({ where: { id: 'default' } })
  if (exists) {
    console.log(`운영사 정보 이미 있음: ${exists.name} (그대로 둠)`)
    return
  }
  await prisma.company.create({
    data: {
      id: 'default',
      name: '예시물류(주)',
      businessNumber: '220-81-12341',
      ceoName: '홍길동',
      businessType: '서비스',
      businessItem: '물류대행',
      phone: '02-123-4567',
      contacts: { create: [{ sortOrder: 0, duty: '입고 문의', name: '김입고' }] },
    },
  })
  console.log('예시 운영사 정보 생성')
}

async function main() {
  await seedSampleOrganizations()
  await seedSampleCompany()
  const groupIds = await seedGroups()
  await seedSuperAdmin(groupIds.get(SUPER_GROUP_NAME)!)
  await seedSampleAccounts(groupIds)
}

main()
  .catch((error) => {
    console.error('시드 실패:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
