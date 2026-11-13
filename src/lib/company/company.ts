import 'server-only'
import { prisma } from '@/lib/prisma'
import type { CompanyData } from './company-schema'

// 운영사 1곳 기준 고정 id (docs/decisions/0024)
export const COMPANY_ID = 'default'

// 운영사 정보 (아직 등록 전이면 null)
export async function getCompany() {
  return prisma.company.findUnique({
    where: { id: COMPANY_ID },
    include: {
      contacts: { orderBy: { sortOrder: 'asc' } },
      updatedBy: { select: { name: true, username: true } },
    },
  })
}

export type Company = NonNullable<Awaited<ReturnType<typeof getCompany>>>

// 저장: 처음이면 만들고, 있으면 고친다. 담당자는 화면 순서대로 통째로 바꾼다 (한 트랜잭션)
export async function saveCompany(data: CompanyData, updatedById: string) {
  const { contacts, ...fields } = data
  await prisma.$transaction([
    prisma.company.upsert({
      where: { id: COMPANY_ID },
      create: { id: COMPANY_ID, ...fields, updatedById },
      update: { ...fields, updatedById },
    }),
    prisma.companyContact.deleteMany({ where: { companyId: COMPANY_ID } }),
    prisma.companyContact.createMany({
      data: contacts.map((contact, index) => ({
        ...contact,
        companyId: COMPANY_ID,
        sortOrder: index,
      })),
    }),
  ])
}
