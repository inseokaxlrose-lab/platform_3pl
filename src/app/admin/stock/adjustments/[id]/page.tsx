import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app-page'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { AdjustDetailPanel, AdjustStatusBadge } from '@/components/stock'
import { parseId } from '@/lib/id'
import { getAdjustDetail } from '@/lib/stock/adjust-queries'
import { ADJUST_TYPE_LABELS } from '@/lib/stock/adjust-schema'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { cancelAdjustAction, confirmAdjustAction } from '../actions'
import { labelOf } from '@/lib/db-value'

export const metadata: Metadata = { title: '실사·조정' }

// 재고 실사·조정 상세 (0061): [확정](관리자) · [취소]
export default async function AdjustmentPage({
  params,
}: PageProps<'/admin/stock/adjustments/[id]'>) {
  if (!(await hasPermission('stock.adjustments.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [adjust, canConfirm, canCancel] = await Promise.all([
    getAdjustDetail(id, await getCurrentScope()),
    hasPermission('stock.adjustments.confirm'),
    hasPermission('stock.adjustments.create'),
  ])
  if (!adjust) notFound()
  return (
    <AppPage
      title={`${labelOf(ADJUST_TYPE_LABELS, adjust.type)} · ${adjust.adjustNo}`}
      description={adjust.center}
      meta={<AdjustStatusBadge status={adjust.status} />}
      actions={<BackToListButton listPath="/admin/stock/adjustments" />}
    >
      <AdjustDetailPanel
        adjust={adjust}
        canConfirm={canConfirm}
        canCancel={canCancel}
        confirmAction={confirmAdjustAction}
        cancelAction={cancelAdjustAction}
      />
    </AppPage>
  )
}
