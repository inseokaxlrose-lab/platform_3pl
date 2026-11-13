import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CenterForm } from '../center-form'
import { getCenterForEdit } from '../queries'

export const metadata: Metadata = { title: '센터 수정' }

// 센터 수정 (데이터 범위 밖이면 "찾을 수 없음" — 존재 여부도 알려주지 않는다)
export default async function EditCenterPage({ params }: PageProps<'/admin/master/centers/[id]'>) {
  if (!(await hasPermission('master.centers.read'))) return <AccessDenied />
  const { id } = await params
  const [scope, canUpdate, canViewWarehouses, canAddWarehouse] = await Promise.all([
    getCurrentScope(),
    hasPermission('master.centers.update'),
    hasPermission('master.warehouses.read'),
    hasPermission('master.warehouses.create'),
  ])
  const center = await getCenterForEdit(id, scope)
  if (!center) notFound()

  return (
    <>
      <PageHeader title={`${center.input.name} (${center.input.code})`} />
      <CenterForm
        center={center}
        readOnly={!canUpdate}
        canToggleActive={canUpdate && scope.kind === 'ALL'}
        warehouseAccess={{ canView: canViewWarehouses, canAdd: canAddWarehouse }}
      />
    </>
  )
}
