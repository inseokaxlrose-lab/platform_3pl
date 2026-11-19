import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { PalletTypeForm } from '../pallet-type-form'
import { getPalletTypeForEdit } from '../queries'

export const metadata: Metadata = { title: '팔레트 종류 수정' }

// 팔레트 종류 수정 (0083): 시스템 기본은 읽기 전용
export default async function EditPalletTypePage({
  params,
}: PageProps<'/admin/master/pallet-types/[id]'>) {
  if (!(await hasPermission('master.units.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  if (scope.operatorId === undefined) notFound()
  const [pallet, canUpdate] = await Promise.all([
    getPalletTypeForEdit(scope.operatorId, id),
    hasPermission('master.units.update'),
  ])
  if (!pallet) notFound()
  return (
    <PalletTypeForm
      key={pallet.rowVersion}
      header={{
        title: `${pallet.input.name} (${pallet.input.code})`,
        actions: <BackToListButton listPath="/admin/master/pallet-types" />,
      }}
      pallet={pallet}
      readOnly={!canUpdate}
    />
  )
}
