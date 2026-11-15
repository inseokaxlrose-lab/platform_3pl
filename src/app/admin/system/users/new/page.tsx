import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { getUserFormOptions } from '../queries'
import { UserForm } from '../user-form'

export const metadata: Metadata = { title: '사용자 등록' }

// 사용자 등록 화면
export default async function NewUserPage() {
  if (!(await hasPermission('system.users.create'))) return <AccessDenied />
  const options = await getUserFormOptions()

  return (
    <UserForm
      header={{
        title: '사용자 등록',
        description: '유형을 먼저 고르면 그에 맞는 소속·권한그룹을 선택할 수 있습니다.',
        actions: <BackToListButton listPath="/admin/system/users" />,
      }}
      options={options}
    />
  )
}
