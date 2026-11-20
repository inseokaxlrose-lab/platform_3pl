import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { ContractForm } from '../contract-form'
import { getContractForEdit, getContractOptions } from '../queries'

export const metadata: Metadata = { title: '운송 계약 수정' }

// 운송 계약 수정 (0094): 센터 직원은 소속 센터의 계약만, 수정 권한이 없으면 읽기 전용
export default async function EditContractPage({
  params,
}: PageProps<'/admin/master/carrier-contracts/[id]'>) {
  if (!(await hasPermission('master.carrier-contracts.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const scope = await getCurrentScope()
  const [found, canUpdate] = await Promise.all([
    getContractForEdit(id, scope),
    hasPermission('master.carrier-contracts.update'),
  ])
  if (!found) notFound()
  // 사용 중지한 운송사도 지금 계약의 것이면 선택지에 남긴다
  const { carrierId, ...contract } = found
  const options = await getContractOptions(scope, [carrierId])
  return (
    <ContractForm
      key={contract.rowVersion}
      header={{
        title: contract.title,
        actions: <BackToListButton listPath="/admin/master/carrier-contracts" />,
      }}
      contract={contract}
      options={options}
      readOnly={!canUpdate}
    />
  )
}
