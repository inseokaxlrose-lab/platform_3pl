import 'server-only'
import { SUPER_GROUP_NAME } from '@/config/defaults/roles'
import { ActionError } from '@/lib/actions/action-error'
import { acrossOperators } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { createUserAccount } from '@/lib/users/create-user-account'
import { adminUsernameOf, type OperatorRegisterData } from './operator-schema'
import { provisionOperator } from './provision'

// 운영사 등록 (플랫폼, docs/decisions/0039 3c·0040 — 사용자 결정)
// 한 트랜잭션: 운영사(운영 상태) → 기본 공통코드·단위·권한그룹 → 관리자 계정 admin.{운영사코드 소문자} (슈퍼 관리자 그룹)
// 정의서의 나머지 칸은 기본값으로 들어가고(계약시작일 = 오늘), 등록 후 편집 화면에서 채운다
// 관리자의 처음 비밀번호는 모든 운영사가 같은 값(.env SEED_ADMIN_PASSWORD) — 운영 전에 바꿔야 하는 방식 (0039 "남은 일")
// 작업 중인 운영사가 있어도 섞이지 않게 운영사 거르기를 끄고, 새 운영사 키를 직접 넣는다
export async function registerOperator(data: OperatorRegisterData, adminPassword: string) {
  const username = adminUsernameOf(data.code)
  return acrossOperators(async () => {
    if (await prisma.operator.findFirst({ where: { code: data.code }, select: { id: true } })) {
      throw new ActionError('CONFLICT', `이미 사용 중인 운영사코드입니다: ${data.code}`)
    }
    if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
      throw new ActionError('CONFLICT', `이미 사용 중인 관리자 아이디입니다: ${username}`)
    }
    return prisma.$transaction(async (tx) => {
      const operator = await tx.operator.create({
        data: {
          code: data.code,
          name: data.name,
          businessNumber: data.businessNumber,
          ceoName: data.ceoName,
          type: data.type,
          status: 'ACTIVE',
        },
        select: { id: true, code: true, name: true },
      })
      const groups = await provisionOperator(tx, operator.id)
      await createUserAccount(
        {
          operatorId: operator.id,
          username,
          password: adminPassword,
          name: `${data.name} 관리자`,
          userType: 'OPERATOR',
          permissionGroupIds: [groups.get(SUPER_GROUP_NAME)!],
        },
        tx,
      )
      return { id: operator.id, code: operator.code, name: operator.name, adminUsername: username }
    })
  })
}
