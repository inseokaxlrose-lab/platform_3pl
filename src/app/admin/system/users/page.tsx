import { UserPlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/session'
import { getUserFormOptions } from './queries'
import { UsersList } from './users-list'

export const metadata: Metadata = { title: '사용자' }

// 사용자 목록 화면 (운영사 전용: 시스템 메뉴 권한은 운영사에게만 계산된다)
export default async function UsersPage() {
  if (!(await hasPermission('system.users.read'))) return <AccessDenied />
  const [options, canCreate, canUpdate, canExport] = await Promise.all([
    getUserFormOptions(),
    hasPermission('system.users.create'),
    hasPermission('system.users.update'),
    hasPermission('system.users.export'),
  ])

  return (
    <UsersList
      options={options}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/system/users/new">
              <UserPlusIcon />
              사용자 등록
            </Link>
          </Button>
        )
      }
      canBulkUpdate={canUpdate}
      canExport={canExport}
    />
  )
}
