import type { Metadata } from 'next'
import { AsnForm, AsnUploadButton } from '@/components/inbound'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getAsnFormOptions, getAsnItemOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import {
  commitPortalAsnUploadAction,
  createPortalAsnAction,
  deletePortalAsnsAction,
  updatePortalAsnAction,
  validatePortalAsnUploadAction,
} from '../actions'

export const metadata: Metadata = { title: 'ASN 등록' }

// 화주 포털 · ASN 등록 (0048): 화주사는 자기 화주사로 고정 (등록 경로 = 화주 포털)
export default async function PortalNewAsnPage() {
  const scope = await getCurrentScope()
  if (!(await hasPermission('portal.asn.create')) || scope.kind !== 'SHIPPER') {
    return <AccessDenied />
  }
  const [options, items] = await Promise.all([
    getAsnFormOptions(scope),
    getAsnItemOptions(scope.shipperId, scope),
  ])
  return (
    <AsnForm
      header={{
        title: 'ASN 등록',
        description: '센터로 보낼 물건을 미리 알립니다. 저장하면 ASN 번호가 붙습니다.',
        actions: (
          <>
            <BackToListButton listPath="/portal/asn" />
            <AsnUploadButton
              withShipper={false}
              listPath="/portal/asn"
              validate={validatePortalAsnUploadAction}
              commit={commitPortalAsnUploadAction}
            />
          </>
        ),
      }}
      options={options}
      readOnly={false}
      basePath="/portal/asn"
      fixedShipperId={String(scope.shipperId)}
      initialItems={items}
      createAction={createPortalAsnAction}
      updateAction={updatePortalAsnAction}
      deleteAction={deletePortalAsnsAction}
    />
  )
}
