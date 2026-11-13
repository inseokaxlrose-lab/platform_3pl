import type { Metadata } from 'next'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { LocationsGrid } from './locations-grid'
import { getWarehouseOptions } from './queries'

export const metadata: Metadata = { title: '로케이션' }

// 로케이션 목록 (docs/decisions/0028): 센터 직원은 소속 센터 창고의 로케이션만
export default async function LocationsPage({
  searchParams,
}: PageProps<'/admin/master/locations'>) {
  if (!(await hasPermission('master.locations.read'))) return <AccessDenied />
  const warehouses = await getWarehouseOptions(await getCurrentScope())
  const { warehouseId } = await searchParams

  return (
    <>
      <PageHeader
        title="로케이션"
        description="창고 안의 보관 위치(예: A-01-02 = A구역 1열 2단)를 관리합니다. 여러 칸은 [일괄 생성]으로 한 번에 만듭니다."
      />
      <LocationsGrid
        warehouses={warehouses}
        initialWarehouseId={typeof warehouseId === 'string' ? warehouseId : undefined}
      />
    </>
  )
}
