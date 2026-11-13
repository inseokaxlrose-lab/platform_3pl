import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { PageHeader } from '@/components/common'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CenterForm } from '../center-form'

export const metadata: Metadata = { title: '센터 등록' }

// 센터 등록 (운영사만: 권한 + 전체 데이터 범위)
export default async function NewCenterPage() {
  const allowed =
    (await hasPermission('master.centers.create')) && (await getCurrentScope()).kind === 'ALL'
  if (!allowed) return <AccessDenied />

  return (
    <>
      <PageHeader
        title="센터 등록"
        description="센터 코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다."
      />
      <CenterForm readOnly={false} />
    </>
  )
}
