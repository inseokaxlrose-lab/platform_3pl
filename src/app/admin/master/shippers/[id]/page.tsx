import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterChoices, getShipperForEdit } from '../queries'
import { ShipperForm } from '../shipper-form'

export const metadata: Metadata = { title: '화주사 수정' }

// 화주사 수정 (범위 밖이면 "찾을 수 없음"). 수정은 운영사만, 센터 직원은 읽기 전용
export default async function EditShipperPage({
  params,
}: PageProps<'/admin/master/shippers/[id]'>) {
  if (!(await hasPermission('master.shippers.read'))) return <AccessDenied />
  const { id } = await params
  const scope = await getCurrentScope()
  const [shipper, centers, canUpdate, canViewUsers, canAddUser] = await Promise.all([
    getShipperForEdit(id, scope),
    getCenterChoices(),
    hasPermission('master.shippers.update'),
    hasPermission('system.users.read'),
    hasPermission('system.users.create'),
  ])
  if (!shipper) notFound()
  const editable = canUpdate && scope.kind === 'ALL'

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={`${shipper.input.name} (${shipper.input.code})`}
        actions={<BackToListButton listPath="/admin/master/shippers" />}
      />
      <ShipperForm
        shipper={shipper}
        centers={centers}
        readOnly={!editable}
        canToggleActive={editable}
        userAccess={{ canView: canViewUsers, canAdd: canAddUser }}
      />
    </div>
  )
}
