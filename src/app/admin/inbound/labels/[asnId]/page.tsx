import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app-page'
import { LabelPrintPanel } from '@/components/labels'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getLabelWork } from '@/lib/labels/label-queries'
import { saveUserPrefAction } from '@/lib/prefs/pref-actions'
import { getUserPref } from '@/lib/prefs/user-prefs'
import { getCurrentScope, getCurrentUser, hasPermission } from '@/lib/session'
import { markLabelsPrintedAction, prepareLabelsAction } from '../actions'

export const metadata: Metadata = { title: '라벨 인쇄' }

// 라벨 인쇄 (0056): ASN 하나의 검수 기록 → 라벨 미리보기·인쇄·재발행
export default async function LabelPrintPage({
  params,
}: PageProps<'/admin/inbound/labels/[asnId]'>) {
  if (!(await hasPermission('inbound.labels.read'))) return <AccessDenied />
  const id = parseId((await params).asnId)
  if (id === null) notFound()
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />
  const [work, canPrint, pref] = await Promise.all([
    getLabelWork(id, await getCurrentScope()),
    hasPermission('inbound.labels.print'),
    getUserPref(user.id, 'label-print'),
  ])
  if (!work) notFound()
  return (
    <AppPage
      title={`라벨 인쇄 · ${work.asnNo}`}
      description={`${work.shipper} · ${work.center}`}
      actions={<BackToListButton listPath="/admin/inbound/labels" />}
    >
      <LabelPrintPanel
        work={work}
        canPrint={canPrint}
        pref={pref}
        prepareAction={prepareLabelsAction}
        markPrintedAction={markLabelsPrintedAction}
        savePrefAction={saveUserPrefAction}
      />
    </AppPage>
  )
}
