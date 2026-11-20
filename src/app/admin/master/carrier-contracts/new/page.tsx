import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { ContractForm } from '../contract-form'
import { getContractOptions } from '../queries'

export const metadata: Metadata = { title: '운송 계약 등록' }

// 운송 계약 등록 (0094)
export default async function NewContractPage() {
  if (!(await hasPermission('master.carrier-contracts.create'))) return <AccessDenied />
  const options = await getContractOptions(await getCurrentScope())
  return (
    <ContractForm
      header={{
        title: '운송 계약 등록',
        actions: <BackToListButton listPath="/admin/master/carrier-contracts" />,
      }}
      options={options}
      readOnly={false}
    />
  )
}
