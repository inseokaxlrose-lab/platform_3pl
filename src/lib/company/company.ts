import 'server-only'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { prisma } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { toYn } from '@/lib/yn'
import { CONTACT_DUTY_GROUP, type CompanyData } from './company-schema'

// 운영사 1곳 기준 고정 키 1 (docs/decisions/0024). M2.5 3단계(멀티테넌트)에서 여러 운영사로 바뀐다
export const COMPANY_ID = 1n

// 운영사 정보 (아직 등록 전이면 null)
export async function getCompany() {
  return prisma.company.findUnique({
    where: { id: COMPANY_ID },
    include: { contacts: { orderBy: { sortOrder: 'asc' } } },
  })
}

export type Company = NonNullable<Awaited<ReturnType<typeof getCompany>>>

// 저장: 처음이면 만들고, 있으면 고친다. 담당자는 화면 순서대로 통째로 바꾼다 (한 트랜잭션)
// 담당 업무는 사용 중인 공통코드만. 이미 저장돼 있던 코드는 그 사이 사용 중지됐어도 그대로 둘 수 있다 (0030)
// rowVersion: 화면이 불러온 버전 (처음 등록이면 null). 그 사이 다른 사람이 저장했으면 충돌
// 고친 사람(updated_by)은 prisma.ts가 지금 작업자로 채운다
export async function saveCompany(data: CompanyData, rowVersion: number | null) {
  const { contacts, ...fields } = data
  return prisma.$transaction(async (tx) => {
    const current = await tx.company.findUnique({
      where: { id: COMPANY_ID },
      select: { rowVersion: true },
    })
    if (current || rowVersion !== null) {
      assertRowVersion(current, rowVersion ?? 0, '운영사 정보를 찾을 수 없습니다.')
    }
    const saved = await tx.companyContact.findMany({
      where: { companyId: COMPANY_ID },
      select: { duty: true },
    })
    await assertCodeValues(
      tx,
      CONTACT_DUTY_GROUP,
      contacts.map((c) => c.duty),
      { label: '담당 업무', keep: saved.map((c) => c.duty) },
    )
    const row = current
      ? await withVersionGuard(() =>
          tx.company.update({
            where: { id: COMPANY_ID, rowVersion: rowVersion ?? 0 },
            data: fields,
            select: { rowVersion: true },
          }),
        )
      : await tx.company.create({
          data: { id: COMPANY_ID, ...fields },
          select: { rowVersion: true },
        })
    await tx.companyContact.deleteMany({ where: { companyId: COMPANY_ID } })
    await tx.companyContact.createMany({
      data: contacts.map((contact, index) => ({
        ...contact,
        isPrimary: toYn(contact.isPrimary),
        companyId: COMPANY_ID,
        sortOrder: index,
      })),
    })
    return { rowVersion: row.rowVersion }
  })
}
