import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { IF_METHOD, SHIPPER_STATUS_BADGE } from '@/lib/shippers/shipper-codes'
import { getCenterChoices, getOperatorDefaults, getShipperForEdit } from '../queries'
import { ShipperForm } from '../shipper-form'
import { ShipperStatusDialog } from '../shipper-status-dialog'

export const metadata: Metadata = { title: '화주사 수정' }

// 화주사 수정 (범위 밖이면 "찾을 수 없음"). 수정·상태 변경은 운영사만, 센터 직원은 읽기 전용
export default async function EditShipperPage({
  params,
}: PageProps<'/admin/master/shippers/[id]'>) {
  if (!(await hasPermission('master.shippers.read'))) return <AccessDenied />
  // 주소의 키가 숫자 모양이 아니면 바로 "찾을 수 없음"
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  const [shipper, centers, operator, canUpdate, canViewUsers, canAddUser] = await Promise.all([
    getShipperForEdit(id, scope),
    getCenterChoices(scope),
    getOperatorDefaults(scope),
    hasPermission('master.shippers.update'),
    hasPermission('system.users.read'),
    hasPermission('system.users.create'),
  ])
  if (!shipper) notFound()
  const editable = canUpdate && scope.kind === 'ALL'
  const badge = SHIPPER_STATUS_BADGE[shipper.status]
  const api = shipper.input.apiEnabled

  return (
    <ShipperForm
      // 상태 변경 후 새로 그릴 때 입력 화면도 새 버전으로 (버전이 바뀌면 다시 만든다)
      key={shipper.rowVersion}
      header={{
        title: `${shipper.input.name} (${shipper.input.code})`,
        meta: (
          <span className="flex flex-wrap items-center gap-2">
            {badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
            {/* 연동 방식 배지: API를 쓰면 "API" */}
            <StatusBadge tone={api ? 'info' : 'neutral'}>
              {api
                ? 'API'
                : IF_METHOD.labels[shipper.input.ifMethod as keyof typeof IF_METHOD.labels]}
            </StatusBadge>
            {shipper.statusReason && <span>사유: {shipper.statusReason}</span>}
            <span>
              · 최종 수정 {shipper.updatedAt.toLocaleString('ko-KR')} ({shipper.updatedBy})
            </span>
          </span>
        ),
        // 마지막으로 본 목록(검색 조건·페이지·정렬 그대로)으로
        actions: (
          <>
            <BackToListButton listPath="/admin/master/shippers" />
            {editable && (
              <ShipperStatusDialog
                shipper={{ id: shipper.id, status: shipper.status, rowVersion: shipper.rowVersion }}
              />
            )}
          </>
        ),
      }}
      shipper={shipper}
      centers={centers}
      operator={operator}
      // 해지된 화주사는 고칠 수 없다 (다시 쓰려면 상태부터 바꾼다)
      readOnly={!editable || shipper.status === 'TERMINATED'}
      userAccess={{ canView: canViewUsers, canAdd: canAddUser }}
    />
  )
}
