import { nextSystemCode } from '@/lib/master-code/system-code'
import { prisma } from '@/lib/prisma'

// DB 테스트용 데이터 만들기 도우미 (테스트 DB에서만 사용)

// 센터 (시스템 코드는 실제처럼 시퀀스로 발급, 입고대기 창고는 만들지 않음 — 필요한 테스트에서 따로)
export async function createTestCenter(
  code: string,
  data: { name?: string; isActive?: boolean } = {},
) {
  return prisma.center.create({
    data: {
      systemCode: await nextSystemCode('CENTER'),
      code,
      name: data.name ?? `${code} 센터`,
      isActive: data.isActive,
    },
  })
}

export function createTestShipper(code: string, data: { name?: string; isActive?: boolean } = {}) {
  return prisma.shipper.create({
    // 시스템 코드: 테스트에서는 시퀀스 대신 코드로 만든 고유 값
    data: {
      code,
      systemCode: `SH-T-${code}`,
      name: data.name ?? `${code} 화주`,
      isActive: data.isActive,
    },
  })
}

type TestUserOptions = {
  userType?: 'OPERATOR' | 'CENTER' | 'SHIPPER'
  centerIds?: bigint[]
  // 화주사 사용자인데 지정하지 않으면 화주사를 새로 만들어 연결한다
  shipperId?: bigint
}

// 표 구조 확인용 사용자 (로그인까지 필요하면 createUserAccount 사용)
export async function createTestUser(username: string, options: TestUserOptions = {}) {
  const userType = options.userType ?? 'CENTER'
  const shipperId =
    userType === 'SHIPPER'
      ? (options.shipperId ?? (await createTestShipper(`S-${username}`)).id)
      : undefined

  return prisma.user.create({
    data: {
      name: username,
      email: `${username}@users.local`,
      username,
      userType,
      shipperId,
      centers: options.centerIds
        ? { create: options.centerIds.map((centerId) => ({ centerId })) }
        : undefined,
    },
  })
}

// 공통코드 그룹 + 코드 (DB 테스트는 표를 비우고 시작하므로 필요한 코드를 직접 만든다)
export function createTestCodeGroup(
  code: string,
  items: { code: string; name?: string; isActive?: boolean }[],
) {
  return prisma.codeGroup.create({
    data: {
      code,
      name: code,
      items: {
        create: items.map((item, index) => ({
          code: item.code,
          name: item.name ?? item.code,
          isActive: item.isActive ?? true,
          sortOrder: index,
        })),
      },
    },
  })
}
