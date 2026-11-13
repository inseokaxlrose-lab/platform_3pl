import { UserPlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/common'
import { AccessDenied, Can } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/session'
import { UsersGrid } from './users-grid'

export const metadata: Metadata = { title: '사용자' }

// 사용자 목록 화면 (운영사 전용: 시스템 메뉴 권한은 운영사에게만 계산된다)
export default async function UsersPage() {
  if (!(await hasPermission('system.users.read'))) return <AccessDenied />

  return (
    <>
      <PageHeader
        title="사용자"
        description="계정을 만들고 소속·권한그룹을 배정합니다. 퇴사자는 삭제하지 않고 사용 중지합니다."
        actions={
          <Can permission="system.users.create">
            <Button asChild>
              <Link href="/admin/system/users/new">
                <UserPlusIcon />
                사용자 등록
              </Link>
            </Button>
          </Can>
        }
      />
      <UsersGrid />
    </>
  )
}
