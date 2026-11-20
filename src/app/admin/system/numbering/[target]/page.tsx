import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { NUMBERING_TARGET, type NumberingTarget } from '@/lib/numbering/numbering-codes'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { NumberingRuleForm } from '../numbering-rule-form'
import { NUMBERING_LIST_HREF } from '../numbering-list'
import { getNumberingRuleForEdit } from '../queries'

export const metadata: Metadata = { title: '체번 규칙 수정' }

// 체번 규칙 수정 (docs/decisions/0085): 주소의 대상 = SHIPPER·CUSTOMER·… (목록에 있는 8개)
export default async function EditNumberingRulePage({
  params,
}: PageProps<'/admin/system/numbering/[target]'>) {
  if (!(await hasPermission('system.numbering.read'))) return <AccessDenied />
  const target = (await params).target.toUpperCase()
  if (!NUMBERING_TARGET.has(target)) notFound()
  const scope = await getCurrentScope()
  if (scope.operatorId === undefined) notFound()
  const [numbering, canUpdate] = await Promise.all([
    getNumberingRuleForEdit(scope.operatorId, target as NumberingTarget),
    hasPermission('system.numbering.update'),
  ])
  if (!numbering) notFound()
  return (
    <NumberingRuleForm
      // 저장·되돌리기 후 다시 읽으면 처음 값부터 새로
      key={`${numbering.overridden}-${numbering.rowVersion}`}
      header={{
        title: `${numbering.targetLabel} 번호`,
        actions: <BackToListButton listPath={NUMBERING_LIST_HREF} />,
      }}
      numbering={numbering}
      readOnly={!canUpdate}
    />
  )
}
