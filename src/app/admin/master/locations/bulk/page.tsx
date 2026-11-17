import type { Metadata } from 'next'
import { AppPage } from '@/components/app-page'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getLocationOptions } from '../queries'
import { BulkLocationForm } from './bulk-form'

export const metadata: Metadata = { title: '로케이션 일괄 생성' }

// 로케이션 일괄 생성: ?warehouseId=&zoneId= 로 들어오면 그 창고·구역을 미리 고른다
export default async function BulkLocationsPage({
  searchParams,
}: PageProps<'/admin/master/locations/bulk'>) {
  if (!(await hasPermission('master.locations.create'))) return <AccessDenied />
  const options = await getLocationOptions(await getCurrentScope())
  const { warehouseId, zoneId } = await searchParams

  // 공통 페이지 틀 (화면 전체 폭)
  return (
    <AppPage
      title="로케이션 일괄 생성"
      description="구역과 열·단 범위, 코드 패턴을 정하고 미리보기로 확인한 뒤 만듭니다. 이미 있는 코드는 건너뜁니다."
    >
      <BulkLocationForm
        options={options}
        initialWarehouseId={typeof warehouseId === 'string' ? warehouseId : undefined}
        initialZoneId={typeof zoneId === 'string' ? zoneId : undefined}
      />
    </AppPage>
  )
}
