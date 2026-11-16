import type { Metadata } from 'next'
import { AsnsList } from '@/components/inbound'
import { AccessDenied } from '@/components/permission'
import { getAsnFormOptions } from '@/lib/inbound/asn-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { listLabelAsnsAction } from './actions'

export const metadata: Metadata = { title: '라벨 인쇄' }

// 라벨 인쇄 · ASN 고르기 (0056): 기본은 검수가 있는 ASN
export default async function LabelsPage() {
  if (!(await hasPermission('inbound.labels.read'))) return <AccessDenied />
  const options = await getAsnFormOptions(await getCurrentScope())
  return (
    <AsnsList
      title="라벨 인쇄"
      description="관리 라벨을 뽑을 ASN을 고릅니다. 입고 상태를 고르지 않으면 검수가 있는 ASN(검수중·부분확정·확정완료)만 보입니다."
      gridId="inbound-labels"
      basePath="/admin/inbound/labels"
      shippers={options.shippers}
      centers={options.centers}
      canExport={false}
      listAction={listLabelAsnsAction}
    />
  )
}
