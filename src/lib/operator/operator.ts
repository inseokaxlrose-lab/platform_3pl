import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { prisma } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { CONTACT_ROLE_GROUP, type OperatorSelfData } from './operator-schema'
import { contactFields } from '@/lib/contacts/contact-schema'

// 운영사 정보 (docs/specs/operator.md, decisions 0024·0039·0040)
// 운영사는 플랫폼이 등록한다 (register-operator.ts). 여기서는 읽기·고치기·상태 변경

// 운영사 한 곳 (담당자 포함, 없으면 null)
export async function getOperator(operatorId: bigint) {
  return prisma.operator.findUnique({
    where: { id: operatorId },
    include: { contacts: { orderBy: { sortOrder: 'asc' } } },
  })
}

export type Operator = NonNullable<Awaited<ReturnType<typeof getOperator>>>

// 저장: 운영사 정보를 고치고, 담당자는 화면 순서대로 통째로 바꾼다 (한 트랜잭션)
// - data.type: 플랫폼 편집에서만 들어온다 (운영사 자기 화면은 유형을 바꿀 수 없다)
// - 담당 업무는 사용 중인 공통코드만. 이미 저장돼 있던 코드는 그 사이 사용 중지됐어도 그대로 둘 수 있다 (0030)
// - 공통코드는 운영사마다 따로라, 그 운영사의 CONTACT_ROLE로 검사한다 (서버 액션의 운영사 출입증)
// rowVersion: 화면이 불러온 버전. 그 사이 다른 사람이 저장했으면 충돌
export async function saveOperator(
  operatorId: bigint,
  data: OperatorSelfData & { type?: string },
  rowVersion: number,
) {
  const { contacts, ...fields } = data
  return prisma.$transaction(async (tx) => {
    const current = await tx.operator.findUnique({
      where: { id: operatorId },
      select: { rowVersion: true },
    })
    assertRowVersion(current, rowVersion, '운영사 정보를 찾을 수 없습니다.')
    const saved = await tx.operatorContact.findMany({
      where: { operatorId },
      select: { duty: true },
    })
    await assertCodeValues(
      tx,
      CONTACT_ROLE_GROUP,
      contacts.map((c) => c.duty),
      { label: '담당 업무', keep: saved.map((c) => c.duty) },
    )
    const row = await withVersionGuard(() =>
      tx.operator.update({
        where: { id: operatorId, rowVersion },
        data: fields,
        select: { rowVersion: true },
      }),
    )
    await tx.operatorContact.deleteMany({ where: { operatorId } })
    await tx.operatorContact.createMany({
      data: contacts.map((contact, index) => ({
        ...contactFields(contact),
        operatorId,
        sortOrder: index,
      })),
    })
    return { rowVersion: row.rowVersion }
  })
}

// 운영 상태 변경 (플랫폼, 정의서 "상태변경 다이얼로그")
// 정지·해지는 사유 필수(입력 규칙 + DB 검사 조건). 운영으로 되돌리면 사유는 비운다
// 운영이 아니게 되면 그 운영사 사용자는 다음 화면부터 막힌다 (session.ts getCurrentUser)
export async function changeOperatorStatus(
  operatorId: bigint,
  rowVersion: number,
  status: string,
  reason: string | null,
) {
  const current = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { rowVersion: true, status: true },
  })
  assertRowVersion(current, rowVersion, '운영사를 찾을 수 없습니다.')
  if (current!.status === status) {
    throw new ActionError('VALIDATION', '지금과 같은 상태입니다.')
  }
  return withVersionGuard(() =>
    prisma.operator.update({
      where: { id: operatorId, rowVersion },
      data: { status, statusReason: status === 'ACTIVE' ? null : reason },
      select: { id: true, status: true, rowVersion: true },
    }),
  )
}
