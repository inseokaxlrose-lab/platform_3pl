import { DEFAULT_CODE_GROUPS } from '@/config/defaults/codes'
import { prisma } from '@/lib/prisma'
import { toStatus } from '@/lib/status'
import { TEST_OPERATOR_ID } from './reset-database'

// DB 테스트용 데이터 만들기 도우미 (테스트 DB에서만 사용)

// 센터 (입고대기 창고는 만들지 않음 — 필요한 테스트에서 따로)
// operatorId: 기본은 테스트 운영사 (다른 운영사 격리 테스트에서만 바꾼다)
export async function createTestCenter(
  code: string,
  data: { name?: string; isActive?: boolean; operatorId?: bigint } = {},
) {
  return prisma.center.create({
    data: {
      operatorId: data.operatorId ?? TEST_OPERATOR_ID,
      code,
      name: data.name ?? `${code} 센터`,
      // 센터 상태 4단계 (0073): 사용 = 운영중, 사용 중지 = 일시중지(사유 필수)
      ...((data.isActive ?? true)
        ? { status: 'ACTIVE' }
        : { status: 'SUSPENDED', statusReason: '테스트' }),
    },
  })
}

// 코드 접두어로 쓸 수 있는 글자 (I·O·0·1 제외, 0084) — 운영사마다 등록 순서대로 AA, AB, …
const PREFIX_FIRST = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const PREFIX_SECOND = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
async function nextTestPrefix(operatorId: bigint) {
  const n = await prisma.shipper.count({ where: { operatorId, delYn: { in: ['Y', 'N'] } } })
  return PREFIX_FIRST[Math.floor(n / 32) % 24] + PREFIX_SECOND[n % 32]
}

export async function createTestShipper(
  code: string,
  data: {
    name?: string
    isActive?: boolean
    operatorId?: bigint
    codePrefix?: string
    ifKeyType?: 'CODE' | 'CUST_CD'
  } = {},
) {
  const operatorId = data.operatorId ?? TEST_OPERATOR_ID
  return prisma.shipper.create({
    data: {
      operatorId,
      code,
      // 거래처·품목 자동 체번 접두어 (안 주면 AA, AB, … 순서)
      codePrefix: data.codePrefix ?? (await nextTestPrefix(operatorId)),
      ifKeyType: data.ifKeyType ?? 'CODE',
      name: data.name ?? `${code} 화주`,
      // 화주사 상태 4단계 (0080): 사용 = 운영중, 사용 중지 = 일시정지(사유 필수)
      ...((data.isActive ?? true)
        ? { status: 'ACTIVE' }
        : { status: 'SUSPENDED', statusReason: '테스트' }),
    },
  })
}

type TestUserOptions = {
  userType?: 'OPERATOR' | 'CENTER' | 'SHIPPER'
  centerIds?: bigint[]
  // 화주사 사용자인데 지정하지 않으면 화주사를 새로 만들어 연결한다
  shipperId?: bigint
  operatorId?: bigint
}

// 표 구조 확인용 사용자 (로그인까지 필요하면 createUserAccount 사용)
export async function createTestUser(username: string, options: TestUserOptions = {}) {
  const userType = options.userType ?? 'CENTER'
  const shipperId =
    userType === 'SHIPPER'
      ? (options.shipperId ??
        (await createTestShipper(`S-${username}`, { operatorId: options.operatorId })).id)
      : undefined

  return prisma.user.create({
    data: {
      operatorId: options.operatorId ?? TEST_OPERATOR_ID,
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
  operatorId: bigint = TEST_OPERATOR_ID,
) {
  return prisma.codeGroup.create({
    data: {
      operatorId,
      code,
      name: code,
      items: {
        create: items.map((item, index) => ({
          operatorId,
          code: item.code,
          name: item.name ?? item.code,
          status: toStatus(item.isActive ?? true),
          sortOrder: index,
        })),
      },
    },
  })
}

// 사유 코드 그룹 (0087): 기본 공통코드의 귀책 그룹들을 그대로 만든다 (입고·재고 테스트 준비에서 부른다)
export async function createReasonCodes(operatorId: bigint = TEST_OPERATOR_ID) {
  for (const group of DEFAULT_CODE_GROUPS.filter((g) => g.faultParty)) {
    await prisma.codeGroup.create({
      data: {
        operatorId,
        code: group.code,
        name: group.name,
        isSystem: 'Y',
        faultPartyYn: 'Y',
        items: {
          create: group.items.map((item, index) => ({
            operatorId,
            code: item.code,
            name: item.name,
            faultParty: item.faultParty ?? null,
            sortOrder: (index + 1) * 10,
          })),
        },
      },
    })
  }
}

// 공통 칸(row_version)이 있는 표의 지금 버전 — 수정 액션 테스트에서 "화면이 불러온 버전" 대신 쓴다
type VersionedModel =
  | 'center'
  | 'warehouse'
  | 'shipper'
  | 'unit'
  | 'codeGroup'
  | 'codeItem'
  | 'permissionGroup'
  | 'user'
  | 'operator'
  | 'item'
  | 'customer'
  | 'asn'
  | 'location'
  | 'palletType'
  | 'carrier'
  | 'carrierContract'
  | 'route'
  | 'operatorHoliday'
  | 'customerItem'

export async function versionOf(model: VersionedModel, id: bigint | string): Promise<number> {
  const delegate = prisma[model] as unknown as {
    findUniqueOrThrow(args: object): Promise<{ rowVersion: number }>
  }
  const row = await delegate.findUniqueOrThrow({
    where: { id: BigInt(id) },
    select: { rowVersion: true },
  })
  return row.rowVersion
}

// 시스템 기본 단위 (마이그레이션이 넣은 EA·KG·BOX·PLT 등, 0078) — 테스트 DB를 비워도 resetDatabase가 되살린다
export function systemUnit(code: string) {
  return prisma.unit.findFirstOrThrow({ where: { code, operatorId: null } })
}
