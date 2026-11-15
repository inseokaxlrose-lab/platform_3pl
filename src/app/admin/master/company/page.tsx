import type { Metadata } from 'next'
import { PageHeader } from '@/components/common'
import { formatDate } from '@/components/data-grid'
import { AccessDenied } from '@/components/permission'
import { formatBusinessNumber, formatPhone } from '@/lib/format'
import { getCompany, type Company } from '@/lib/company/company'
import type { CompanyInput } from '@/lib/company/company-schema'
import { hasPermission } from '@/lib/session'
import { CompanyForm } from './company-form'

export const metadata: Metadata = { title: '운영사' }

// DB 값 → 입력값 (빈 값은 빈 글자, 숫자만 저장된 번호는 하이픈을 붙여서 — 0029)
function toInput(company: Company | null): CompanyInput {
  const phone = (value: string | null | undefined) => formatPhone(value ?? '')
  return {
    name: company?.name ?? '',
    businessNumber: formatBusinessNumber(company?.businessNumber ?? ''),
    ceoName: company?.ceoName ?? '',
    businessType: company?.businessType ?? '',
    businessItem: company?.businessItem ?? '',
    phone: phone(company?.phone),
    fax: phone(company?.fax),
    email: company?.email ?? '',
    zipCode: company?.zipCode ?? '',
    address: company?.address ?? '',
    addressDetail: company?.addressDetail ?? '',
    contacts: (company?.contacts ?? []).map((c) => ({
      duty: c.duty,
      name: c.name,
      phone: phone(c.phone),
      email: c.email ?? '',
    })),
  }
}

// 운영사 정보 화면: 운영사 1곳의 정보 (수정 권한이 없으면 읽기 전용, docs/decisions/0024)
export default async function CompanyPage() {
  if (!(await hasPermission('master.company.read'))) return <AccessDenied />

  const [company, canUpdate] = await Promise.all([
    getCompany(),
    hasPermission('master.company.update'),
  ])
  const updated = company?.updatedBy
    ? `마지막 수정: ${company.updatedBy.name} (${company.updatedBy.username}) · ${formatDate(company.updatedAt, true)}`
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="운영사"
        description={
          company
            ? (updated ?? '이 시스템을 운영하는 회사의 정보입니다.')
            : canUpdate
              ? '아직 등록된 정보가 없습니다. 입력 후 저장하세요.'
              : '아직 등록된 정보가 없습니다.'
        }
        className="mb-0"
      />
      <CompanyForm initial={toInput(company)} readOnly={!canUpdate} />
    </div>
  )
}
