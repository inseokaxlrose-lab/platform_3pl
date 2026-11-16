import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { ExternalCodesList } from './external-codes-list'

export const metadata: Metadata = { title: '외부코드 매핑' }

// 외부코드 매핑 (docs/decisions/0068): 기준정보 7종의 SAP·ERP 코드를 한곳에서
export default async function ExternalCodesPage() {
  if (!(await hasPermission('master.external-codes.read'))) return <AccessDenied />
  const [update, exportExcel] = await Promise.all([
    hasPermission('master.external-codes.update'),
    hasPermission('master.external-codes.export'),
  ])
  return <ExternalCodesList can={{ update, export: exportExcel }} />
}
