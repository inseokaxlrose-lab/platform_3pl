import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getWarehouseForEdit } from '../queries'
import { WarehouseForm } from '../warehouse-form'

export const metadata: Metadata = { title: '창고 수정' }

// 창고 수정 (데이터 범위 밖이면 "찾을 수 없음")
export default async function EditWarehousePage({
  params,
}: PageProps<'/admin/master/warehouses/[id]'>) {
  if (!(await hasPermission('master.warehouses.read'))) return <AccessDenied />
  const { id } = await params
  const [warehouse, canUpdate] = await Promise.all([
    getWarehouseForEdit(id, await getCurrentScope()),
    hasPermission('master.warehouses.update'),
  ])
  if (!warehouse) notFound()

  return (
    <>
      <PageHeader
        title={`${warehouse.input.name} (${warehouse.input.code})`}
        description={`${warehouse.center.name} (${warehouse.center.code})`}
      />
      <WarehouseForm mode="edit" warehouse={warehouse} readOnly={!canUpdate} />
    </>
  )
}
