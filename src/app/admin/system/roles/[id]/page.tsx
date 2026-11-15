import type { Metadata } from 'next'
import { parseId } from '@/lib/id'
import { notFound } from 'next/navigation'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getPermissionGroup } from '../queries'
import { RoleForm } from '../role-form'

export const metadata: Metadata = { title: '권한그룹 수정' }

// 권한그룹 수정 화면 (수정 권한이 없으면 읽기 전용)
export default async function EditRolePage({ params }: PageProps<'/admin/system/roles/[id]'>) {
  if (!(await hasPermission('system.roles.read'))) return <AccessDenied />

  // 주소의 키가 숫자 모양이 아니면 바로 "찾을 수 없음"
  const id = parseId((await params).id)
  if (id === null) notFound()
  const group = await getPermissionGroup(id, await getCurrentScope())
  if (!group) notFound()

  return (
    <RoleForm
      header={{
        title: group.name,
        actions: <BackToListButton listPath="/admin/system/roles" />,
        description: `사용자 ${group.userCount}명이 이 권한그룹을 사용 중입니다.`,
      }}
      group={group}
    />
  )
}
