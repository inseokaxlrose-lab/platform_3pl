import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AsnForm } from '@/components/inbound'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getAsnForEdit, getAsnFormOptions, getAsnItemOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import {
  createAsnAction,
  deleteAsnsAction,
  listAsnItemOptionsAction,
  updateAsnAction,
} from '../actions'

export const metadata: Metadata = { title: 'ASN' }

// 운영사 화면 · ASN 수정·보기 (0048): 예정 상태에서만 고칠 수 있다
export default async function AsnPage({ params }: PageProps<'/admin/inbound/asn/[id]'>) {
  if (!(await hasPermission('inbound.asn.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  const asn = await getAsnForEdit(id, scope)
  if (!asn) notFound()
  const [options, items, canUpdate, canDelete] = await Promise.all([
    getAsnFormOptions(scope),
    getAsnItemOptions(BigInt(asn.shipperId), scope),
    hasPermission('inbound.asn.update'),
    hasPermission('inbound.asn.delete'),
  ])

  return (
    <AsnForm
      header={{
        title: `ASN ${asn.asnNo}`,
        description: asn.shipper,
        actions: <BackToListButton listPath="/admin/inbound/asn" />,
      }}
      options={options}
      asn={asn}
      readOnly={!canUpdate}
      basePath="/admin/inbound/asn"
      initialItems={items}
      loadItems={listAsnItemOptionsAction}
      createAction={createAsnAction}
      updateAction={updateAsnAction}
      deleteAction={deleteAsnsAction}
      canDelete={canDelete}
    />
  )
}
