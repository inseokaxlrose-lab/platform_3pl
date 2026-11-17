import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { isActiveStatus } from '@/lib/status'
import { getWarehouseForEdit } from '../queries'
import { WarehouseForm } from '../warehouse-form'
import { WarehouseHeaderActions } from '../warehouse-header-actions'

export const metadata: Metadata = { title: '창고 수정' }

// 창고 수정 (데이터 범위 밖이면 "찾을 수 없음")
export default async function EditWarehousePage({
  params,
}: PageProps<'/admin/master/warehouses/[id]'>) {
  if (!(await hasPermission('master.warehouses.read'))) return <AccessDenied />
  // 주소의 키가 숫자 모양이 아니면 바로 "찾을 수 없음"
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [warehouse, canUpdate, canDelete, canViewLocations] = await Promise.all([
    getWarehouseForEdit(id, await getCurrentScope()),
    hasPermission('master.warehouses.update'),
    hasPermission('master.warehouses.delete'),
    hasPermission('master.locations.read'),
  ])
  if (!warehouse) notFound()
  const isActive = isActiveStatus(warehouse.status)
  // 폐쇄된 센터의 창고는 고칠 수 없다
  const centerClosed = warehouse.center.status === 'CLOSED'

  return (
    <WarehouseForm
      // 상태 변경 후 새로 그릴 때 입력 화면도 새 버전으로
      key={warehouse.rowVersion}
      header={{
        title: `${warehouse.input.name} (${warehouse.input.code})`,
        meta: (
          <span className="flex flex-wrap items-center gap-2">
            {warehouse.isSystem && <StatusBadge tone="info">기본</StatusBadge>}
            <StatusBadge tone={isActive ? 'success' : 'danger'}>
              {isActive ? '사용' : '사용 중지'}
            </StatusBadge>
            <span>
              {warehouse.center.name} ({warehouse.center.code})
            </span>
            <span>
              · 최종 수정 {warehouse.updatedAt.toLocaleString('ko-KR')} ({warehouse.updatedBy})
            </span>
          </span>
        ),
        actions: (
          <>
            <BackToListButton listPath="/admin/master/warehouses" />
            <WarehouseHeaderActions
              warehouse={{ id: warehouse.id, isActive, isSystem: warehouse.isSystem }}
              canViewLocations={canViewLocations}
              canChangeStatus={canUpdate && !centerClosed}
              canDelete={canDelete && !centerClosed}
            />
          </>
        ),
      }}
      mode="edit"
      warehouse={warehouse}
      readOnly={!canUpdate || centerClosed}
    />
  )
}
