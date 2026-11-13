import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { AccountPanel } from '../account-panel'
import { getUserForEdit, getUserFormOptions } from '../queries'
import { UserForm } from '../user-form'

export const metadata: Metadata = { title: '사용자 수정' }

// 사용자 수정 화면 (수정 권한이 없으면 읽기 전용)
export default async function EditUserPage({ params }: PageProps<'/admin/system/users/[id]'>) {
  if (!(await hasPermission('system.users.read'))) return <AccessDenied />

  const { id } = await params
  const [user, options] = await Promise.all([getUserForEdit(id), getUserFormOptions()])
  if (!user) notFound()

  return (
    <div className="space-y-6">
      <PageHeader title={`${user.name} (${user.username})`} className="mb-0" />
      <UserForm options={options} user={user} />
      <AccountPanel user={user} />
    </div>
  )
}
