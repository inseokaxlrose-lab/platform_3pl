import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app-page'
import { StatusBadge } from '@/components/common'
import { ConfirmPanel } from '@/components/inbound'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { ASN_STATUS_LABELS } from '@/lib/inbound/asn-schema'
import { getConfirmWork } from '@/lib/inbound/receipt-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { confirmReceiptAction } from '../actions'

export const metadata: Metadata = { title: '입고 확정' }

// 입고 확정 (0057): ASN 하나의 검수 기록 → 확정 수량 → 입고대기 창고에 재고
export default async function ConfirmWorkPage({
  params,
}: PageProps<'/admin/inbound/confirm/[asnId]'>) {
  if (!(await hasPermission('inbound.confirm.read'))) return <AccessDenied />
  const id = parseId((await params).asnId)
  if (id === null) notFound()
  const [work, canConfirm] = await Promise.all([
    getConfirmWork(id, await getCurrentScope()),
    hasPermission('inbound.confirm.confirm'),
  ])
  if (!work) notFound()
  return (
    <AppPage
      title={`입고 확정 · ${work.asnNo}`}
      description={`${work.shipper} · ${work.center}`}
      meta={
        <StatusBadge tone={work.status === 'CLOSED' ? 'danger' : 'info'}>
          {ASN_STATUS_LABELS[work.status]}
        </StatusBadge>
      }
      actions={<BackToListButton listPath="/admin/inbound/confirm" />}
    >
      <ConfirmPanel work={work} canConfirm={canConfirm} confirmAction={confirmReceiptAction} />
    </AppPage>
  )
}
