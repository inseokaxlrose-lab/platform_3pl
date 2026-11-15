import type { Metadata } from 'next'
import { AsnForm, AsnUploadButton } from '@/components/inbound'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getAsnFormOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import {
  commitAsnUploadAction,
  createAsnAction,
  deleteAsnsAction,
  listAsnItemOptionsAction,
  updateAsnAction,
  validateAsnUploadAction,
} from '../actions'

export const metadata: Metadata = { title: 'ASN 등록' }

// 운영사 화면 · ASN 등록 (0048): 센터 운영자가 화주사를 대신해 등록 (등록 경로 = 센터 대리)
export default async function NewAsnPage() {
  if (!(await hasPermission('inbound.asn.create'))) return <AccessDenied />
  const options = await getAsnFormOptions(await getCurrentScope())
  return (
    <AsnForm
      header={{
        title: 'ASN 등록',
        description: '화주사를 대신해 입고예정을 등록합니다. 저장하면 ASN 번호가 붙습니다.',
        actions: (
          <>
            <BackToListButton listPath="/admin/inbound/asn" />
            <AsnUploadButton
              withShipper
              listPath="/admin/inbound/asn"
              validate={validateAsnUploadAction}
              commit={commitAsnUploadAction}
            />
          </>
        ),
      }}
      options={options}
      readOnly={false}
      basePath="/admin/inbound/asn"
      loadItems={listAsnItemOptionsAction}
      createAction={createAsnAction}
      updateAction={updateAsnAction}
      deleteAction={deleteAsnsAction}
    />
  )
}
