import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterChoices, getShipperForEdit } from '../queries'
import { ShipperForm } from '../shipper-form'

export const metadata: Metadata = { title: '화주사 수정' }

// 화주사 수정 (범위 밖이면 "찾을 수 없음"). 수정은 운영사만, 센터 직원은 읽기 전용
export default async function EditShipperPage({
  params,
}: PageProps<'/admin/master/shippers/[id]'>) {
  if (!(await hasPermission('master.shippers.read'))) return <AccessDenied />
  // 주소의 키가 숫자 모양이 아니면 바로 "찾을 수 없음"
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  const [shipper, centers, canUpdate, canViewUsers, canAddUser] = await Promise.all([
    getShipperForEdit(id, scope),
    getCenterChoices(scope),
    hasPermission('master.shippers.update'),
    hasPermission('system.users.read'),
    hasPermission('system.users.create'),
  ])
  if (!shipper) notFound()
  const editable = canUpdate && scope.kind === 'ALL'

  return (
    <ShipperForm
      header={{
        title: `${shipper.input.name} (${shipper.input.code})`,
        actions: <BackToListButton listPath="/admin/master/shippers" />,
      }}
      shipper={shipper}
      centers={centers}
      readOnly={!editable}
      canToggleActive={editable}
      userAccess={{ canView: canViewUsers, canAdd: canAddUser }}
    />
  )
}
