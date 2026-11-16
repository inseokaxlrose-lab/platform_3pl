import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { DeliveryZoneForm } from '../delivery-zone-form'
import { getDeliveryZoneForEdit, getOtherZoneRegions, getTakenRegions } from '../queries'

export const metadata: Metadata = { title: '배송권역 수정' }

// 배송권역 수정 (데이터 범위 밖이면 "찾을 수 없음")
export default async function EditDeliveryZonePage({
  params,
}: PageProps<'/admin/master/delivery-zones/[id]'>) {
  if (!(await hasPermission('master.delivery-zones.read'))) return <AccessDenied />
  // 주소의 키가 숫자 모양이 아니면 바로 "찾을 수 없음"
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  const [zone, taken, others, canUpdate] = await Promise.all([
    getDeliveryZoneForEdit(id, scope),
    // 자기 권역의 지역은 "다른 권역이 쓰는 지역"에서 뺀다
    getTakenRegions(scope, id),
    getOtherZoneRegions(scope, id),
    hasPermission('master.delivery-zones.update'),
  ])
  if (!zone) notFound()

  return (
    <DeliveryZoneForm
      header={{
        title: `${zone.input.name} (${zone.input.code})`,
        description: `${zone.center.name} (${zone.center.code})`,
        actions: <BackToListButton listPath="/admin/master/delivery-zones" />,
      }}
      zone={zone}
      taken={taken}
      others={others}
      readOnly={!canUpdate}
      canToggleActive={canUpdate}
    />
  )
}
