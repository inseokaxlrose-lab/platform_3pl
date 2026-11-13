import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/common'
import { AccessDenied, Can } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/session'
import { RolesGrid } from './roles-grid'

export const metadata: Metadata = { title: '권한그룹' }

// 권한그룹 목록 화면
export default async function RolesPage() {
  if (!(await hasPermission('system.roles.read'))) return <AccessDenied />

  return (
    <>
      <PageHeader
        title="권한그룹"
        description="메뉴·버튼 권한을 묶어 사용자에게 배정합니다."
        actions={
          <Can permission="system.roles.create">
            <Button asChild>
              <Link href="/admin/system/roles/new">
                <PlusIcon />
                권한그룹 등록
              </Link>
            </Button>
          </Can>
        }
      />
      <RolesGrid />
    </>
  )
}
