import type { Metadata } from 'next'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { CodesManager } from './codes-manager'

export const metadata: Metadata = { title: '공통코드' }

// 공통코드 관리 (docs/decisions/0030): 코드 그룹 → 코드 2단계
export default async function CodesPage() {
  if (!(await hasPermission('system.codes.read'))) return <AccessDenied />
  return (
    <>
      <PageHeader
        title="공통코드"
        description="화면의 고르기 목록(담당 업무 등)에 쓰는 코드를 그룹별로 관리합니다. 코드는 등록 후 바꿀 수 없고, 쓰지 않게 되면 사용 중지합니다."
      />
      <CodesManager />
    </>
  )
}
