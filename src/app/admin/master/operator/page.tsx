import type { Metadata } from 'next'
import { formatDate } from '@/components/data-grid'
import { AccessDenied } from '@/components/permission'
import { getOperator, type Operator } from '@/lib/operator/operator'
import type { OperatorInput } from '@/lib/operator/operator-schema'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { actorLabel } from '@/lib/users/actor-label'
import { isYes } from '@/lib/yn'
import { CompanyForm } from './company-form'

export const metadata: Metadata = { title: '운영사' }

// DB 값 → 입력값 (빈 값은 빈 글자. 번호는 숫자 그대로 — 입력 부품이 하이픈을 붙여 보여준다, 0029)
function toInput(company: Operator): OperatorInput {
  const text = (value: string | null | undefined) => value ?? ''
  return {
    name: text(company?.name),
    businessNumber: text(company?.businessNumber),
    ceoName: text(company?.ceoName),
    businessType: text(company?.businessType),
    businessItem: text(company?.businessItem),
    phone: text(company?.phone),
    fax: text(company?.fax),
    email: text(company?.email),
    zipCode: text(company?.zipCode),
    address: text(company?.address),
    addressDetail: text(company?.addressDetail),
    contacts: (company?.contacts ?? []).map((c) => ({
      duty: c.duty,
      name: c.name,
      phone: text(c.phone),
      email: text(c.email),
      isPrimary: isYes(c.isPrimary),
    })),
  }
}

// 운영사 정보 화면: 내 운영사의 정보 (수정 권한이 없으면 읽기 전용, docs/decisions/0024, 0039)
export default async function CompanyPage() {
  if (!(await hasPermission('master.company.read'))) return <AccessDenied />

  const { operatorId } = await getCurrentScope()
  const [company, canUpdate] = await Promise.all([
    operatorId === undefined ? null : getOperator(operatorId),
    hasPermission('master.company.update'),
  ])
  // 운영사가 없는 사용자는 없다 (사용자는 반드시 운영사에 속한다). 혹시 없으면 볼 수 없음으로
  if (!company) return <AccessDenied />
  const updated = `마지막 수정: ${await actorLabel(company.updatedBy)} · ${formatDate(company.updatedAt, true)}`

  return (
    <CompanyForm
      header={{
        title: '운영사',
        description: '우리 회사(운영사)의 정보입니다.',
        // 설명 다음 줄: 마지막으로 고친 사람·시각
        meta: updated,
      }}
      initial={toInput(company)}
      version={company.rowVersion}
      readOnly={!canUpdate}
    />
  )
}
