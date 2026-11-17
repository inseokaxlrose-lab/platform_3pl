import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterChoices, getOperatorDefaults } from '../queries'
import { ShipperForm } from '../shipper-form'

export const metadata: Metadata = { title: '화주사 등록' }

// 화주사 등록 (운영사만: 권한 + 전체 데이터 범위). 새 화주사는 "준비중"으로 시작한다 (0080)
export default async function NewShipperPage() {
  const scope = await getCurrentScope()
  const allowed = (await hasPermission('master.shippers.create')) && scope.kind === 'ALL'
  if (!allowed) return <AccessDenied />
  const [centers, operator] = await Promise.all([
    getCenterChoices(scope),
    getOperatorDefaults(scope),
  ])

  return (
    <ShipperForm
      header={{
        title: '화주사 등록',
        description:
          '화주사 코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다. 새 화주사는 "준비중"으로 시작하고, 준비가 끝나면 [상태 변경]으로 운영중으로 바꿉니다.',
        actions: <BackToListButton listPath="/admin/master/shippers" />,
      }}
      centers={centers}
      operator={operator}
      readOnly={false}
    />
  )
}
