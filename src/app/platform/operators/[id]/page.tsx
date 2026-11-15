import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CommonCodeProvider } from '@/components/common-code'
import { formatDate } from '@/components/data-grid'
import { BackToListButton } from '@/components/master-list'
import { OperatorForm, OperatorStatusBadge } from '@/components/operator'
import { AccessDenied } from '@/components/permission'
import { loadCodeOptions } from '@/lib/common-code/common-codes'
import { parseId } from '@/lib/id'
import { getOperator } from '@/lib/operator/operator'
import { toOperatorInput } from '@/lib/operator/operator-input'
import { hasPermission } from '@/lib/session'
import { actorLabel } from '@/lib/users/actor-label'
import { updateOperatorAction } from '../actions'
import { OperatorStatusDialog } from './operator-status-dialog'

export const metadata: Metadata = { title: '운영사 편집' }

// 플랫폼 · 운영사 편집 (docs/specs/operator.md [1차], 0040): 유형까지 고치고, 상태는 [상태 변경] 팝업으로
export default async function PlatformOperatorPage({
  params,
}: PageProps<'/platform/operators/[id]'>) {
  if (!(await hasPermission('platform.operators.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [operator, canUpdate] = await Promise.all([
    getOperator(id),
    hasPermission('platform.operators.update'),
  ])
  if (!operator) notFound()
  // 담당 업무 고르기 목록은 그 운영사의 공통코드 (플랫폼 화면 틀에는 운영사 공통코드가 없다)
  const codeOptions = await loadCodeOptions(operator.id)
  const updated = `마지막 수정: ${await actorLabel(operator.updatedBy)} · ${formatDate(operator.updatedAt, true)}`

  return (
    <CommonCodeProvider options={codeOptions}>
      <OperatorForm
        // 상태를 바꾸면 버전이 올라가므로, 새 버전으로 폼을 다시 그린다
        key={operator.rowVersion}
        header={{
          title: `${operator.name} (${operator.code})`,
          description: '운영사 정보를 고칩니다. 운영 상태는 [상태 변경]으로 바꿉니다.',
          meta: (
            <span className="inline-flex flex-wrap items-center gap-3">
              <OperatorStatusBadge status={operator.status} reason={operator.statusReason} />
              {updated}
            </span>
          ),
          actions: (
            <>
              <BackToListButton listPath="/platform/operators" />
              {canUpdate && (
                <OperatorStatusDialog
                  operatorId={String(operator.id)}
                  rowVersion={operator.rowVersion}
                  status={operator.status}
                />
              )}
            </>
          ),
        }}
        code={operator.code}
        operatorId={String(operator.id)}
        initial={toOperatorInput(operator)}
        version={operator.rowVersion}
        readOnly={!canUpdate}
        canEditType
        saveAction={updateOperatorAction}
      />
    </CommonCodeProvider>
  )
}
