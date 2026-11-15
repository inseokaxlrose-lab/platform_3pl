import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getWarehouseForEdit } from '../queries'
import { WarehouseForm } from '../warehouse-form'

export const metadata: Metadata = { title: '창고 수정' }

// 창고 수정 (데이터 범위 밖이면 "찾을 수 없음")
export default async function EditWarehousePage({
  params,
}: PageProps<'/admin/master/warehouses/[id]'>) {
  if (!(await hasPermission('master.warehouses.read'))) return <AccessDenied />
  // 주소의 키가 숫자 모양이 아니면 바로 "찾을 수 없음"
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [warehouse, canUpdate] = await Promise.all([
    getWarehouseForEdit(id, await getCurrentScope()),
    hasPermission('master.warehouses.update'),
  ])
  if (!warehouse) notFound()

  return (
    <WarehouseForm
      header={{
        actions: <BackToListButton listPath="/admin/master/warehouses" />,
        title: `${warehouse.input.name} (${warehouse.input.code})`,
        description: `${warehouse.center.name} (${warehouse.center.code})`,
      }}
      mode="edit"
      warehouse={warehouse}
      readOnly={!canUpdate}
    />
  )
}
