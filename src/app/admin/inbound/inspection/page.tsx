import type { Metadata } from 'next'
import { AsnsList } from '@/components/inbound'
import { AccessDenied } from '@/components/permission'
import { getAsnFormOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listInspectionAsnsAction } from './actions'

export const metadata: Metadata = { title: '입고 검수' }

// 입고 검수 · ASN 고르기 (0053): 기본은 진행 중인 ASN (예정·검수중·부분확정)
export default async function InspectionPage() {
  if (!(await hasPermission('inbound.inspection.read'))) return <AccessDenied />
  const options = await getAsnFormOptions(await getCurrentScope())
  return (
    <AsnsList
      title="입고 검수"
      description="검수할 ASN을 고릅니다. 입고 상태를 고르지 않으면 진행 중인 ASN(예정·검수중·부분확정)만 보입니다."
      gridId="inbound-inspection"
      basePath="/admin/inbound/inspection"
      shippers={options.shippers}
      centers={options.centers}
      canExport={false}
      listAction={listInspectionAsnsAction}
    />
  )
}
