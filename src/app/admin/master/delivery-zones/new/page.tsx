import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterOptions } from '../../warehouses/queries'
import { DeliveryZoneForm } from '../delivery-zone-form'
import { getOtherZoneRegions, getTakenRegions } from '../queries'

export const metadata: Metadata = { title: '배송권역 등록' }

// 배송권역 등록 (센터 상세의 [권역 추가]로 오면 ?centerId=로 센터를 미리 고른다)
export default async function NewDeliveryZonePage({
  searchParams,
}: PageProps<'/admin/master/delivery-zones/new'>) {
  if (!(await hasPermission('master.delivery-zones.create'))) return <AccessDenied />
  const scope = await getCurrentScope()
  const [centers, taken, others, { centerId }] = await Promise.all([
    getCenterOptions(scope),
    getTakenRegions(scope),
    getOtherZoneRegions(scope),
    searchParams,
  ])
  const initialCenterId =
    typeof centerId === 'string' && centers.some((c) => c.id === centerId) ? centerId : undefined

  return (
    <DeliveryZoneForm
      header={{
        title: '배송권역 등록',
        description: '권역 코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다.',
        actions: <BackToListButton listPath="/admin/master/delivery-zones" />,
      }}
      centers={centers}
      initialCenterId={initialCenterId ?? (centers.length === 1 ? centers[0].id : undefined)}
      taken={taken}
      others={others}
      readOnly={false}
    />
  )
}
