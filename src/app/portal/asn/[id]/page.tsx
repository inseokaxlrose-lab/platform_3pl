import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AsnForm } from '@/components/inbound'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getAsnForEdit, getAsnFormOptions, getAsnItemOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { createPortalAsnAction, deletePortalAsnsAction, updatePortalAsnAction } from '../actions'

export const metadata: Metadata = { title: 'ASN' }

// 화주 포털 · ASN 수정·보기 (0048): 자기 화주사의 ASN만 (다른 화주사 키면 "찾을 수 없음")
export default async function PortalAsnPage({ params }: PageProps<'/portal/asn/[id]'>) {
  if (!(await hasPermission('portal.asn.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  if (scope.kind !== 'SHIPPER') return <AccessDenied />
  const asn = await getAsnForEdit(id, scope)
  if (!asn) notFound()
  const [options, items, canUpdate, canDelete] = await Promise.all([
    getAsnFormOptions(scope),
    getAsnItemOptions(scope.shipperId, scope),
    hasPermission('portal.asn.update'),
    hasPermission('portal.asn.delete'),
  ])

  return (
    <AsnForm
      header={{ title: `ASN ${asn.asnNo}`, actions: <BackToListButton listPath="/portal/asn" /> }}
      options={options}
      asn={asn}
      readOnly={!canUpdate}
      basePath="/portal/asn"
      fixedShipperId={String(scope.shipperId)}
      initialItems={items}
      createAction={createPortalAsnAction}
      updateAction={updatePortalAsnAction}
      deleteAction={deletePortalAsnsAction}
      canDelete={canDelete}
    />
  )
}
