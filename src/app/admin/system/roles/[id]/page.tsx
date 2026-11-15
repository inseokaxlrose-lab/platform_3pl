import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { getPermissionGroup } from '../queries'
import { RoleForm } from '../role-form'

export const metadata: Metadata = { title: '권한그룹 수정' }

// 권한그룹 수정 화면 (수정 권한이 없으면 읽기 전용)
export default async function EditRolePage({ params }: PageProps<'/admin/system/roles/[id]'>) {
  if (!(await hasPermission('system.roles.read'))) return <AccessDenied />

  const { id } = await params
  const group = await getPermissionGroup(id)
  if (!group) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={group.name}
        actions={<BackToListButton listPath="/admin/system/roles" />}
        description={`사용자 ${group.userCount}명이 이 권한그룹을 사용 중입니다.`}
      />
      <RoleForm group={group} />
    </div>
  )
}
