import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CarrierForm } from '../carrier-form'
import { getCarrierForEdit } from '../queries'

export const metadata: Metadata = { title: '운송사 수정' }

// 운송사 수정 (0094): 수정 권한이 없으면 읽기 전용
export default async function EditCarrierPage({
  params,
}: PageProps<'/admin/master/carriers/[id]'>) {
  if (!(await hasPermission('master.carriers.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [carrier, canUpdate] = await Promise.all([
    getCarrierForEdit(id, await getCurrentScope()),
    hasPermission('master.carriers.update'),
  ])
  if (!carrier) notFound()
  return (
    <CarrierForm
      key={carrier.rowVersion}
      header={{
        title: `${carrier.input.name} (${carrier.input.code})`,
        description: `운송 계약 ${carrier.contractCount}건에서 쓰고 있습니다.`,
        actions: <BackToListButton listPath="/admin/master/carriers" />,
      }}
      carrier={carrier}
      readOnly={!canUpdate}
    />
  )
}
