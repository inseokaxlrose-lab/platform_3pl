import type { Metadata } from 'next'
import { PageHeader } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { RoleForm } from '../role-form'

export const metadata: Metadata = { title: '권한그룹 등록' }

// 권한그룹 등록 화면
export default async function NewRolePage() {
  if (!(await hasPermission('system.roles.create'))) return <AccessDenied />

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="권한그룹 등록"
        description="영역을 고른 뒤 권한을 체크하세요."
        actions={<BackToListButton listPath="/admin/system/roles" />}
      />
      <RoleForm />
    </div>
  )
}
