import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { ContractsList } from './contracts-list'
import { getContractOptions } from './queries'

export const metadata: Metadata = { title: '운송 계약' }

// 운송 계약 (0094): 센터 직원은 소속 센터의 계약만
export default async function ContractsPage() {
  if (!(await hasPermission('master.carrier-contracts.read'))) return <AccessDenied />
  const [options, create, update, remove, exportAll] = await Promise.all([
    getContractOptions(await getCurrentScope()),
    hasPermission('master.carrier-contracts.create'),
    hasPermission('master.carrier-contracts.update'),
    hasPermission('master.carrier-contracts.delete'),
    hasPermission('master.carrier-contracts.export'),
  ])
  return (
    <ContractsList options={options} can={{ create, update, delete: remove, export: exportAll }} />
  )
}
