import type { Metadata } from 'next'
import { AsnsList } from '@/components/inbound'
import { AccessDenied } from '@/components/permission'
import { getAsnFormOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listConfirmAsnsAction } from './actions'

export const metadata: Metadata = { title: '입고 확정' }

// 입고 확정 · ASN 고르기 (0057): 기본은 검수중·부분확정
export default async function ConfirmPage() {
  if (!(await hasPermission('inbound.confirm.read'))) return <AccessDenied />
  const options = await getAsnFormOptions(await getCurrentScope())
  return (
    <AsnsList
      title="입고 확정"
      description="검수한 수량을 재고로 확정할 ASN을 고릅니다. 입고 상태를 고르지 않으면 검수중·부분확정만 보입니다."
      gridId="inbound-confirm"
      basePath="/admin/inbound/confirm"
      shippers={options.shippers}
      centers={options.centers}
      canExport={false}
      listAction={listConfirmAsnsAction}
    />
  )
}
