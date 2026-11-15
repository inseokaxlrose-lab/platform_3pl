import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { DeliveryZoneForm } from '../delivery-zone-form'
import { getDeliveryZoneForEdit, getTakenRegions } from '../queries'

export const metadata: Metadata = { title: '배송권역 수정' }

// 배송권역 수정 (데이터 범위 밖이면 "찾을 수 없음")
export default async function EditDeliveryZonePage({
  params,
}: PageProps<'/admin/master/delivery-zones/[id]'>) {
  if (!(await hasPermission('master.delivery-zones.read'))) return <AccessDenied />
  const { id } = await params
  const scope = await getCurrentScope()
  const [zone, taken, canUpdate] = await Promise.all([
    getDeliveryZoneForEdit(id, scope),
    // 자기 권역의 지역은 "다른 권역이 쓰는 지역"에서 뺀다
    getTakenRegions(scope, id),
    hasPermission('master.delivery-zones.update'),
  ])
  if (!zone) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={`${zone.input.name} (${zone.input.code})`}
        description={`${zone.center.name} (${zone.center.code})`}
        actions={<BackToListButton listPath="/admin/master/delivery-zones" />}
      />
      <DeliveryZoneForm
        zone={zone}
        taken={taken}
        readOnly={!canUpdate}
        canToggleActive={canUpdate}
      />
    </div>
  )
}
