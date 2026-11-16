import type { Metadata } from 'next'
import { PrinterIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app-page'
import { StatusBadge } from '@/components/common'
import { InspectionWorkPanel } from '@/components/inbound'
import { BackToListButton } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { ASN_STATUS_LABELS } from '@/lib/inbound/asn-schema'
import { getInspectionWork } from '@/lib/inbound/inspection-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { addInspectionAction, deleteInspectionAction } from '../actions'

export const metadata: Metadata = { title: '입고 검수' }

// 입고 검수 작업 (0053): ASN 하나의 품목별 검수 등록·기록
export default async function InspectionWorkPage({
  params,
}: PageProps<'/admin/inbound/inspection/[asnId]'>) {
  if (!(await hasPermission('inbound.inspection.read'))) return <AccessDenied />
  const id = parseId((await params).asnId)
  if (id === null) notFound()
  const [work, canUpdate, canLabels] = await Promise.all([
    getInspectionWork(id, await getCurrentScope()),
    hasPermission('inbound.inspection.update'),
    hasPermission('inbound.labels.read'),
  ])
  if (!work) notFound()
  return (
    <AppPage
      title={`검수 · ${work.asnNo}`}
      description={`${work.shipper} · ${work.center} · 예정일 ${work.expectedOn}`}
      meta={
        <StatusBadge tone={work.status === 'CLOSED' ? 'danger' : 'info'}>
          {ASN_STATUS_LABELS[work.status]}
        </StatusBadge>
      }
      actions={
        <>
          <BackToListButton listPath="/admin/inbound/inspection" />
          {canLabels && work.inspections.length > 0 && (
            <Button asChild variant="outline">
              <Link href={`/admin/inbound/labels/${work.id}`}>
                <PrinterIcon />
                라벨 인쇄
              </Link>
            </Button>
          )}
        </>
      }
    >
      <InspectionWorkPanel
        work={work}
        canUpdate={canUpdate}
        addAction={addInspectionAction}
        deleteAction={deleteInspectionAction}
      />
    </AppPage>
  )
}
