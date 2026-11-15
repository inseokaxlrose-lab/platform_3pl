import type { Metadata } from 'next'
import { PageHeader } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterChoices } from '../queries'
import { ShipperForm } from '../shipper-form'

export const metadata: Metadata = { title: '화주사 등록' }

// 화주사 등록 (운영사만: 권한 + 전체 데이터 범위)
export default async function NewShipperPage() {
  const allowed =
    (await hasPermission('master.shippers.create')) && (await getCurrentScope()).kind === 'ALL'
  if (!allowed) return <AccessDenied />
  const centers = await getCenterChoices()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="화주사 등록"
        description="화주사 코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다."
        actions={<BackToListButton listPath="/admin/master/shippers" />}
      />
      <ShipperForm centers={centers} readOnly={false} />
    </div>
  )
}
