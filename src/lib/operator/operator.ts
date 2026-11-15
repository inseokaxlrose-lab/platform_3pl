import 'server-only'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { prisma } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { toYn } from '@/lib/yn'
import { CONTACT_DUTY_GROUP, type OperatorData } from './operator-schema'

// 운영사 정보 (docs/decisions/0024, 0039)
// 운영사는 플랫폼에 등록될 때 만들어지고(3단계 운영사 만들기), 운영사 사용자는 자기 운영사 정보만 보고 고친다

// 내 운영사 정보 (없으면 null)
export async function getOperator(operatorId: bigint) {
  return prisma.operator.findUnique({
    where: { id: operatorId },
    include: { contacts: { orderBy: { sortOrder: 'asc' } } },
  })
}

export type Operator = NonNullable<Awaited<ReturnType<typeof getOperator>>>

// 저장: 운영사 정보를 고치고, 담당자는 화면 순서대로 통째로 바꾼다 (한 트랜잭션)
// 담당 업무는 사용 중인 공통코드만. 이미 저장돼 있던 코드는 그 사이 사용 중지됐어도 그대로 둘 수 있다 (0030)
// rowVersion: 화면이 불러온 버전. 그 사이 다른 사람이 저장했으면 충돌
// 고친 사람(updated_by)은 prisma.ts가 지금 작업자로 채운다
export async function saveOperator(operatorId: bigint, data: OperatorData, rowVersion: number) {
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
      CONTACT_DUTY_GROUP,
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
        ...contact,
        isPrimary: toYn(contact.isPrimary),
        operatorId,
        sortOrder: index,
      })),
    })
    return { rowVersion: row.rowVersion }
  })
}
