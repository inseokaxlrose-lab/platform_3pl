import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/session'
import { RolesList } from './roles-list'

export const metadata: Metadata = { title: '권한그룹' }

// 권한그룹 목록 화면
export default async function RolesPage() {
  if (!(await hasPermission('system.roles.read'))) return <AccessDenied />
  const canCreate = await hasPermission('system.roles.create')

  return (
    <RolesList
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/system/roles/new">
              <PlusIcon />
              권한그룹 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
