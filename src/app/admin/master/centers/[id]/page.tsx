import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { CENTER_STATUS_BADGE } from '@/lib/centers/center-status'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CenterForm } from '../center-form'
import { CenterHeaderActions } from '../center-header-actions'
import { getCenterForEdit } from '../queries'

export const metadata: Metadata = { title: '센터 수정' }

// 센터 수정 (데이터 범위 밖이면 "찾을 수 없음" — 존재 여부도 알려주지 않는다)
export default async function EditCenterPage({ params }: PageProps<'/admin/master/centers/[id]'>) {
  if (!(await hasPermission('master.centers.read'))) return <AccessDenied />
  // 주소의 키가 숫자 모양이 아니면 바로 "찾을 수 없음"
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [
    scope,
    canUpdate,
    canDelete,
    canViewLocations,
    canViewWarehouses,
    canAddWarehouse,
    canViewZones,
    canAddZone,
  ] = await Promise.all([
    getCurrentScope(),
    hasPermission('master.centers.update'),
    hasPermission('master.centers.delete'),
    hasPermission('master.locations.read'),
    hasPermission('master.warehouses.read'),
    hasPermission('master.warehouses.create'),
    hasPermission('master.delivery-zones.read'),
    hasPermission('master.delivery-zones.create'),
  ])
  const center = await getCenterForEdit(id, scope)
  if (!center) notFound()
  const badge = CENTER_STATUS_BADGE[center.status]
  // 상태 변경·삭제는 운영사(전체 범위)만
  const isOperatorUser = scope.kind === 'ALL'

  return (
    <CenterForm
      // 상태 변경 후 새로 그릴 때 입력 화면도 새 버전으로 (버전이 바뀌면 다시 만든다)
      key={center.rowVersion}
      header={{
        title: `${center.input.name} (${center.code})`,
        meta: (
          <span className="flex flex-wrap items-center gap-2">
            {badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
            {center.statusReason && <span>사유: {center.statusReason}</span>}
            {center.closedOn && <span>· 운영 종료일 {center.closedOn}</span>}
            <span>
              · 최종 수정 {center.updatedAt.toLocaleString('ko-KR')} ({center.updatedBy})
            </span>
          </span>
        ),
        // 마지막으로 본 목록(검색 조건·페이지·정렬 그대로)으로
        actions: (
          <>
            <BackToListButton listPath="/admin/master/centers" />
            <CenterHeaderActions
              center={{ id: center.id, status: center.status, rowVersion: center.rowVersion }}
              canViewLocations={canViewLocations}
              canChangeStatus={canUpdate && isOperatorUser}
              canDelete={canDelete && isOperatorUser}
            />
          </>
        ),
      }}
      center={center}
      // 폐쇄된 센터는 고칠 수 없다 (다시 운영하려면 상태부터 바꾼다)
      readOnly={!canUpdate || center.status === 'CLOSED'}
      warehouseAccess={{ canView: canViewWarehouses, canAdd: canAddWarehouse }}
      zoneAccess={{ canView: canViewZones, canAdd: canAddZone }}
    />
  )
}
