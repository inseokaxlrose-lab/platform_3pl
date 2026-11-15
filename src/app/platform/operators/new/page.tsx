import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { OperatorRegisterForm } from './operator-register-form'

export const metadata: Metadata = { title: '운영사 등록' }

// 플랫폼 · 운영사 등록 (0039 3c)
export default async function NewOperatorPage() {
  if (!(await hasPermission('platform.operators.create'))) return <AccessDenied />
  return (
    <OperatorRegisterForm
      header={{
        title: '운영사 등록',
        description:
          '등록하면 기본 공통코드·단위·권한그룹이 복사되고, 관리자 계정이 슈퍼 관리자 권한으로 함께 만들어집니다.',
        actions: <BackToListButton listPath="/platform/operators" />,
      }}
    />
  )
}
