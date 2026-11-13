import type { Metadata } from 'next'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getWarehouseOptions } from '../queries'
import { BulkLocationForm } from './bulk-form'

export const metadata: Metadata = { title: '로케이션 일괄 생성' }

// 로케이션 일괄 생성: ?warehouseId= 로 들어오면 그 창고를 미리 고른다
export default async function BulkLocationsPage({
  searchParams,
}: PageProps<'/admin/master/locations/bulk'>) {
  if (!(await hasPermission('master.locations.create'))) return <AccessDenied />
  const warehouses = await getWarehouseOptions(await getCurrentScope())
  const { warehouseId } = await searchParams

  return (
    <>
      <PageHeader
        title="로케이션 일괄 생성"
        description="범위를 정하고 미리보기로 확인한 뒤 만듭니다. 이미 있는 코드는 건너뜁니다."
      />
      <BulkLocationForm
        warehouses={warehouses}
        initialWarehouseId={typeof warehouseId === 'string' ? warehouseId : undefined}
      />
    </>
  )
}
