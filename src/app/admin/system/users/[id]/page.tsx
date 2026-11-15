import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCurrentUser, hasPermission } from '@/lib/session'
import { AccountPanel } from '../account-panel'
import { OverridePanel } from '../override-panel'
import { getUserForEdit, getUserFormOptions, getUserOverrides } from '../queries'
import { UserForm } from '../user-form'

export const metadata: Metadata = { title: '사용자 수정' }

// 사용자 수정 화면 (수정 권한이 없으면 읽기 전용)
// 개별 권한·계정 관리는 자기 버튼으로 따로 저장하는 섹션 (아래 저장 막대와 별개)
export default async function EditUserPage({ params }: PageProps<'/admin/system/users/[id]'>) {
  if (!(await hasPermission('system.users.read'))) return <AccessDenied />

  const { id } = await params
  const [user, options, overrides, currentUser, canUpdate] = await Promise.all([
    getUserForEdit(id),
    getUserFormOptions(),
    getUserOverrides(id),
    getCurrentUser(),
    hasPermission('system.users.update'),
  ])
  if (!user || !overrides) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={`${user.name} (${user.username})`}
        actions={<BackToListButton listPath="/admin/system/users" />}
      />
      <UserForm
        options={options}
        user={user}
        extraSections={[
          {
            id: 'overrides',
            title: '개별 권한',
            standalone: true,
            content: (
              <OverridePanel
                user={user}
                overrides={overrides}
                isSelf={currentUser?.id === user.id}
              />
            ),
          },
          ...(canUpdate
            ? [
                {
                  id: 'account',
                  title: '계정 관리',
                  standalone: true,
                  description: '사용 중지·비밀번호 초기화는 바로 처리되고, 기존 로그인을 끊습니다.',
                  content: <AccountPanel user={user} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
