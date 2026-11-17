// 개발용 시드: npm run db:seed (여러 번 실행해도 안전)
// - 예시 운영사 (아직 없을 때만, 사업자번호는 검증번호 규칙으로 만든 가상 번호) — 아래 데이터는 모두 이 운영사 것 (0039)
// - 운영사 기본값(공통코드·단위·권한그룹 4개, src/config/defaults): 권한그룹 권한은 실행할 때마다 정의와 똑같이 맞춘다
// - 예시 센터·화주사 (코드 기준으로 없을 때만 만든다) + 센터마다 입고대기 창고·기본 로케이션
// - 슈퍼 계정: .env의 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (비밀번호는 코드에 두지 않는다)
// - 플랫폼 관리자: .env의 SEED_PLATFORM_USERNAME / SEED_PLATFORM_PASSWORD (비어 있으면 건너뛴다, 0039)
// - 역할별 견본 계정 4개: .env의 SEED_SAMPLE_PASSWORD (비어 있거나 운영 환경이면 건너뛴다)
// - 두 번째 견본 운영사 나라물류(주) + 관리자 admin.nara(처음 비밀번호 SEED_ADMIN_PASSWORD) + 센터 ICN (운영 환경이면 건너뛴다)
// 이미 있는 계정은 비밀번호·소속을 덮어쓰지 않는다 (화면에서 바꾼 값을 지키기 위해)
import 'dotenv/config'
import { ensureCenterDefaults } from '../src/lib/centers/center-defaults'
import { nextSystemCode } from '../src/lib/master-code/system-code'
import { prisma } from '../src/lib/prisma'
import { acrossOperators, runAsActor, runInContext } from '../src/lib/actor'
import { toYn } from '../src/lib/yn'
import { createUserAccount } from '../src/lib/users/create-user-account'
import { SUPER_GROUP_NAME } from '../src/config/defaults/roles'
import { provisionOperator } from '../src/lib/operator/provision'
import { registerOperator } from '../src/lib/operator/register-operator'
import { SAMPLE_ACCOUNTS } from './seed-samples'

async function linkGroup(userId: bigint, groupId: bigint) {
  await prisma.userPermissionGroup.upsert({
    where: { userId_groupId: { userId, groupId } },
    create: { userId, groupId },
    update: {},
  })
}

// 아이디는 운영사와 상관없이 전체에서 하나 → 찾을 때 운영사 거르기를 끈다
const findUserByUsername = (username: string) =>
  acrossOperators(() => prisma.user.findUnique({ where: { username } }))

async function seedSuperAdmin(operatorId: bigint, groupId: bigint) {
  const username = (process.env.SEED_ADMIN_USERNAME ?? 'admin').toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!password) {
    throw new Error('SEED_ADMIN_PASSWORD가 .env에 없습니다. .env.example을 참고해 추가해 주세요.')
  }

  let user = await findUserByUsername(username)
  if (!user) {
    user = await createUserAccount({
      operatorId,
      username,
      password,
      name: '슈퍼 관리자',
      userType: 'OPERATOR',
    })
    console.log(`슈퍼 계정 생성: ${username}`)
  } else {
    console.log(`슈퍼 계정 이미 있음: ${username} (비밀번호는 그대로)`)
  }
  if (user.userType !== 'OPERATOR' || user.operatorId !== operatorId) {
    throw new Error(
      `'${username}' 계정이 이 운영사의 운영사 유형이 아니라 슈퍼 계정으로 쓸 수 없습니다.`,
    )
  }

  await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } })
  await linkGroup(user.id, groupId)
}

// 플랫폼 관리자: 운영사에 속하지 않고 권한그룹도 없다 (플랫폼 권한은 유형으로 정해진다, 0039)
// 없을 때만 만든다 (비밀번호는 덮어쓰지 않는다)
async function seedPlatformAdmin() {
  const username = (process.env.SEED_PLATFORM_USERNAME ?? 'platform').toLowerCase()
  const password = process.env.SEED_PLATFORM_PASSWORD
  if (!password) {
    console.log('플랫폼 관리자: SEED_PLATFORM_PASSWORD가 비어 있어 건너뜀 (.env.example 참고)')
    return
  }
  const user = await findUserByUsername(username)
  if (user) {
    if (user.userType !== 'PLATFORM') {
      throw new Error(
        `'${username}' 계정이 플랫폼 관리자 유형이 아니라 플랫폼 관리자로 쓸 수 없습니다.`,
      )
    }
    console.log(`플랫폼 관리자 이미 있음: ${username} (비밀번호는 그대로)`)
    return
  }
  await createUserAccount({
    operatorId: null,
    username,
    password,
    name: '플랫폼 관리자',
    userType: 'PLATFORM',
  })
  console.log(`플랫폼 관리자 생성: ${username}`)
}

// 역할별 견본 계정: 없을 때만 만든다
async function seedSampleAccounts(operatorId: bigint, groupIds: Map<string, bigint>) {
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
    if (await findUserByUsername(account.username)) {
      console.log(`견본 계정 이미 있음: ${account.username} (그대로 둠)`)
      continue
    }
    const centers = await prisma.center.findMany({
      where: { operatorId, code: { in: account.centerCodes ?? [] } },
      select: { id: true },
    })
    const shipper = account.shipperCode
      ? await prisma.shipper.findUniqueOrThrow({
          where: { operatorId_code: { operatorId, code: account.shipperCode } },
        })
      : null

    await createUserAccount({
      operatorId,
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
// 견본 화주사 (0035): 로트·유통기한을 쓰는 식품 화주사 / 안 쓰는 전자 화주사 — M3 완료 기준 확인용
const SAMPLE_SHIPPERS = [
  { code: 'GANA', name: '가나식품', useLot: true, useExpiry: true, centerCodes: ['ICN'] },
  { code: 'DARA', name: '다라전자', useLot: false, useExpiry: false, centerCodes: ['ICN', 'GMH'] },
]

// 예시 조직: 이미 있으면 건드리지 않는다 (화면에서 바꾼 이름을 덮어쓰지 않기 위해)
async function seedSampleOrganizations(operatorId: bigint) {
  for (const center of SAMPLE_CENTERS) {
    // 없을 때만 만든다 (시스템 코드는 시퀀스로 발급)
    const found =
      (await prisma.center.findUnique({
        where: { operatorId_code: { operatorId, code: center.code } },
      })) ??
      (await prisma.center.create({
        data: { ...center, operatorId, systemCode: await nextSystemCode('CENTER') },
      }))
    // 입고대기 창고 + 기본 로케이션 (이미 있으면 그대로)
    await ensureCenterDefaults(prisma, found.id)
  }
  for (const { centerCodes, ...shipper } of SAMPLE_SHIPPERS) {
    const centers = await prisma.center.findMany({
      where: { operatorId, code: { in: centerCodes } },
      select: { id: true },
    })
    const found = await prisma.shipper.findUnique({
      where: { operatorId_code: { operatorId, code: shipper.code } },
      select: { id: true, _count: { select: { centers: true } } },
    })
    if (!found) {
      await prisma.shipper.create({
        data: {
          ...shipper,
          operatorId,
          useLot: toYn(shipper.useLot),
          useExpiry: toYn(shipper.useExpiry),
          systemCode: await nextSystemCode('SHIPPER'),
          // 견본은 바로 입고를 받을 수 있게 운영중으로 (새로 등록하는 화주사는 준비중, 0080)
          status: 'ACTIVE',
          // 첫 센터가 기본 센터
          centers: {
            create: centers.map((c, i) => ({ centerId: c.id, isDefault: toYn(i === 0) })),
          },
        },
      })
    } else if (found._count.centers === 0) {
      // 이용 센터가 아직 없는 예전 견본(화주사 정보 관리 전에 만든 것)만 기본값·이용 센터를 채운다
      await prisma.shipper.update({
        where: { id: found.id },
        data: {
          useLot: toYn(shipper.useLot),
          useExpiry: toYn(shipper.useExpiry),
          centers: {
            create: centers.map((c, i) => ({ centerId: c.id, isDefault: toYn(i === 0) })),
          },
        },
      })
    }
  }
  console.log(`예시 센터 ${SAMPLE_CENTERS.length}곳 · 화주사 ${SAMPLE_SHIPPERS.length}곳 확인`)
}

// 예시 운영사: 없을 때만 만든다 (화면에서 입력한 실제 정보를 덮어쓰지 않기 위해)
// 가장 먼저 만든 운영사(운영사 1)를 예시 운영사로 본다. 돌려주는 값: 운영사 키
async function seedSampleOperator(): Promise<bigint> {
  const exists = await prisma.operator.findFirst({ orderBy: { id: 'asc' } })
  if (exists) {
    console.log(`운영사 이미 있음: ${exists.name} (그대로 둠)`)
    return exists.id
  }
  const created = await prisma.operator.create({
    data: {
      code: 'DEMO',
      name: '예시물류(주)',
      businessNumber: '2208112341',
      ceoName: '홍길동',
      businessType: '서비스',
      businessItem: '물류대행',
      phone: '021234567',
      contacts: { create: [{ sortOrder: 0, duty: 'INBOUND', name: '김입고', isPrimary: 'Y' }] },
    },
  })
  console.log(`예시 운영사 생성: ${created.name}`)
  return created.id
}

// 운영사 기본값 (공통코드·단위·권한그룹): 개발 시드는 권한그룹 권한을 정의와 똑같이 다시 맞춘다
async function seedOperatorDefaults(operatorId: bigint, label: string) {
  const groupIds = await provisionOperator(prisma, operatorId, { syncGroupPermissions: true })
  console.log(`${label}: 기본 공통코드·단위·권한그룹 ${groupIds.size}개 확인`)
  return groupIds
}

// 두 번째 견본 운영사 (0039 3c): 운영사 격리를 화면에서 확인하는 용도 (운영 환경이면 건너뛴다)
// 플랫폼의 운영사 등록과 같은 함수로 만든다 → 관리자 admin.nara (처음 비밀번호 SEED_ADMIN_PASSWORD)
const SECOND_OPERATOR = {
  code: 'NARA',
  name: '나라물류(주)',
  businessNumber: '3128112349',
  ceoName: '김나라',
  type: '3PL',
}

async function seedSecondOperator() {
  if (process.env.NODE_ENV === 'production') {
    console.log('두 번째 견본 운영사: 운영 환경이라 건너뜀')
    return
  }
  const found = await prisma.operator.findFirst({ where: { code: SECOND_OPERATOR.code } })
  const operatorId = found
    ? found.id
    : (await registerOperator(SECOND_OPERATOR, process.env.SEED_ADMIN_PASSWORD ?? '')).id
  console.log(`두 번째 견본 운영사 ${found ? '이미 있음' : '생성'}: ${SECOND_OPERATOR.name}`)
  await runInContext({ actor: 'seed', operatorId }, async () => {
    await seedOperatorDefaults(operatorId, SECOND_OPERATOR.name)
    // 예시 운영사와 같은 센터 코드 ICN (운영사마다 따로 쓸 수 있다)
    const center =
      (await prisma.center.findUnique({
        where: { operatorId_code: { operatorId, code: 'ICN' } },
      })) ??
      (await prisma.center.create({
        data: {
          operatorId,
          code: 'ICN',
          name: '나라 인천센터',
          systemCode: await nextSystemCode('CENTER'),
        },
      }))
    await ensureCenterDefaults(prisma, center.id)
  })
}

async function main() {
  const operatorId = await seedSampleOperator()
  // 이 아래는 모두 예시 운영사의 데이터 (운영사 출입증: 읽기·쓰기가 이 운영사로 걸러지고 채워진다)
  await runInContext({ actor: 'seed', operatorId }, async () => {
    const groupIds = await seedOperatorDefaults(operatorId, '예시 운영사')
    await seedSampleOrganizations(operatorId)
    await seedSuperAdmin(operatorId, groupIds.get(SUPER_GROUP_NAME)!)
    await seedSampleAccounts(operatorId, groupIds)
  })
  await seedSecondOperator()
  // 플랫폼 관리자는 운영사 밖 (출입증 없이)
  await runAsActor('seed', seedPlatformAdmin)
}

// 시드가 만든 데이터의 등록·수정자는 'seed'
runAsActor('seed', main)
  .catch((error) => {
    console.error('시드 실패:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
