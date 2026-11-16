import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { BackToListButton } from '@/components/master-list'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CenterForm } from '../center-form'
import { getOperatorDefaults } from '../queries'

export const metadata: Metadata = { title: '센터 등록' }

// 센터 등록 (운영사만: 권한 + 전체 데이터 범위)
export default async function NewCenterPage() {
  const scope = await getCurrentScope()
  const allowed = (await hasPermission('master.centers.create')) && scope.kind === 'ALL'
  if (!allowed) return <AccessDenied />
  // 상속 칸(출고 마감)에 보여 줄 운영사 값
  const operator = await getOperatorDefaults(scope.operatorId)

  return (
    <CenterForm
      header={{
        title: '센터 등록',
        description:
          '등록하면 준비중 상태로 시작하고, 입고·출고·반품 대기 창고와 기본 로케이션이 자동으로 만들어집니다.',
        actions: <BackToListButton listPath="/admin/master/centers" />,
      }}
      operator={operator}
      readOnly={false}
    />
  )
}
