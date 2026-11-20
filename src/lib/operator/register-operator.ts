import 'server-only'
import { SUPER_GROUP_NAME } from '@/config/defaults/roles'
import { ActionError } from '@/lib/actions/action-error'
import { acrossOperators } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { createUserAccount } from '@/lib/users/create-user-account'
import { generateTempPassword } from '@/lib/users/temp-password'
import { adminUsernameOf, type OperatorRegisterData } from './operator-schema'
import { provisionOperator } from './provision'

// 운영사 등록 (플랫폼, docs/decisions/0039 3c·0040 — 사용자 결정)
// 한 트랜잭션: 운영사(운영 상태) → 기본 공통코드·단위·권한그룹 → 관리자 계정 admin.{운영사코드 소문자} (슈퍼 관리자 그룹)
// 정의서의 나머지 칸은 기본값으로 들어가고(계약시작일 = 오늘), 등록 후 편집 화면에서 채운다
// 관리자의 처음 비밀번호는 운영사마다 새로 만든 임시 비밀번호 — 결과로 한 번만 돌려주고, 처음 로그인 때 바꾸게 한다 (0086)
// 시드는 개발 편의로 비밀번호를 넘긴다(.env SEED_ADMIN_PASSWORD) → 그 경우만 변경 강제를 걸지 않는다
// 작업 중인 운영사가 있어도 섞이지 않게 운영사 거르기를 끄고, 새 운영사 키를 직접 넣는다
export async function registerOperator(data: OperatorRegisterData, seedPassword?: string) {
  const username = adminUsernameOf(data.code)
  const tempPassword = seedPassword ?? generateTempPassword()
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
          password: tempPassword,
          passwordChangeRequired: seedPassword === undefined,
          name: `${data.name} 관리자`,
          userType: 'OPERATOR',
          permissionGroupIds: [groups.get(SUPER_GROUP_NAME)!],
        },
        tx,
      )
      return {
        id: operator.id,
        code: operator.code,
        name: operator.name,
        adminUsername: username,
        // 화면에 한 번만 보여 줄 임시 비밀번호 (시드가 넘긴 비밀번호는 돌려주지 않는다)
        tempPassword: seedPassword === undefined ? tempPassword : null,
      }
    })
  })
}
