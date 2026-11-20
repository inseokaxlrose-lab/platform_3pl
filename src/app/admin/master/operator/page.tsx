import type { Metadata } from 'next'
import { formatDate } from '@/components/data-grid'
import { OperatorForm, OperatorStatusBadge } from '@/components/operator'
import { AccessDenied } from '@/components/permission'
import { getOperator } from '@/lib/operator/operator'
import { toOperatorInput } from '@/lib/operator/operator-input'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { actorLabel } from '@/lib/users/actor-label'
import { saveOperatorAction } from './actions'
import { OperatorImages } from './operator-images'

export const metadata: Metadata = { title: '운영사' }

// 운영사 자기 화면: 내 운영사의 정보 (docs/specs/operator.md, 0024·0039·0040)
// 수정 권한이 없으면 읽기 전용. 운영사코드·유형·상태는 플랫폼이 정해 읽기 전용
export default async function OperatorPage() {
  if (!(await hasPermission('master.operator.read'))) return <AccessDenied />

  const { operatorId } = await getCurrentScope()
  const [operator, canUpdate] = await Promise.all([
    operatorId === undefined ? null : getOperator(operatorId),
    hasPermission('master.operator.update'),
  ])
  // 운영사가 없는 사용자는 없다 (사용자는 반드시 운영사에 속한다). 혹시 없으면 볼 수 없음으로
  if (!operator) return <AccessDenied />
  const updated = `마지막 수정: ${await actorLabel(operator.updatedBy)} · ${formatDate(operator.updatedAt, true)}`

  return (
    <OperatorForm
      header={{
        title: '운영사',
        description:
          '우리 회사(운영사)의 정보입니다. 운영사코드·유형·운영 상태는 플랫폼에서 정합니다.',
        // 설명 다음 줄: 운영 상태 · 마지막으로 고친 사람·시각
        meta: (
          <span className="inline-flex flex-wrap items-center gap-3">
            <OperatorStatusBadge status={operator.status} />
            {updated}
          </span>
        ),
      }}
      code={operator.code}
      initial={toOperatorInput(operator)}
      version={operator.rowVersion}
      readOnly={!canUpdate}
      canEditType={false}
      saveAction={saveOperatorAction}
      extraSections={[
        {
          id: 'images',
          title: '로고·직인',
          description:
            '출력물(라벨·거래명세서 등)에 쓰는 이미지입니다. PNG·JPEG·WEBP·GIF, 10MB까지.',
          standalone: true,
          content: (
            <OperatorImages
              logoFileId={operator.logoFileId ? String(operator.logoFileId) : null}
              stampFileId={operator.stampFileId ? String(operator.stampFileId) : null}
              canEdit={canUpdate}
            />
          ),
        },
      ]}
    />
  )
}
