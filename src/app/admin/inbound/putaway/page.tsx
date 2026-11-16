import type { Metadata } from 'next'
import { AsnsList } from '@/components/inbound'
import { AccessDenied } from '@/components/permission'
import { getAsnFormOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listPutawayAsnsAction } from './actions'

export const metadata: Metadata = { title: '적치' }

// 적치 · ASN 고르기 (0058): 기본은 확정이 있고 적치가 남은 ASN
export default async function PutawayPage() {
  if (!(await hasPermission('inbound.putaway.read'))) return <AccessDenied />
  const options = await getAsnFormOptions(await getCurrentScope())
  return (
    <AsnsList
      title="적치"
      description="입고 확정한 재고를 보관 로케이션으로 옮길 ASN을 고릅니다. 조건을 고르지 않으면 적치가 남은 ASN만 보입니다."
      gridId="inbound-putaway"
      basePath="/admin/inbound/putaway"
      shippers={options.shippers}
      centers={options.centers}
      canExport={false}
      listAction={listPutawayAsnsAction}
    />
  )
}
