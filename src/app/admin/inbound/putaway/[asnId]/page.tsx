import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app-page'
import { StatusBadge } from '@/components/common'
import { PutawayPanel } from '@/components/inbound'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { PUTAWAY_STATUS_LABELS } from '@/lib/inbound/asn-schema'
import { getPutawayWork } from '@/lib/inbound/putaway-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { registerPutawayAction } from '../actions'
import { labelOf } from '@/lib/db-value'

export const metadata: Metadata = { title: '적치' }

// 적치 (0058): ASN 하나의 입고확정 재고 → 보관 로케이션
export default async function PutawayWorkPage({
  params,
}: PageProps<'/admin/inbound/putaway/[asnId]'>) {
  if (!(await hasPermission('inbound.putaway.read'))) return <AccessDenied />
  const id = parseId((await params).asnId)
  if (id === null) notFound()
  const [work, canConfirm] = await Promise.all([
    getPutawayWork(id, await getCurrentScope()),
    hasPermission('inbound.putaway.confirm'),
  ])
  if (!work) notFound()
  return (
    <AppPage
      title={`적치 · ${work.asnNo}`}
      description={`${work.shipper} · ${work.center}`}
      meta={
        <StatusBadge tone={work.putawayStatus === 'DONE' ? 'success' : 'info'}>
          {labelOf(PUTAWAY_STATUS_LABELS, work.putawayStatus)}
        </StatusBadge>
      }
      actions={<BackToListButton listPath="/admin/inbound/putaway" />}
    >
      <PutawayPanel work={work} canConfirm={canConfirm} putawayAction={registerPutawayAction} />
    </AppPage>
  )
}
