import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CentersList } from './centers-list'

export const metadata: Metadata = { title: '센터' }

// 센터 목록 (docs/decisions/0026): 센터 직원은 소속 센터만 보인다
export default async function CentersPage() {
  if (!(await hasPermission('master.centers.read'))) return <AccessDenied />
  const [scope, canCreate, canUpdate, canExport] = await Promise.all([
    getCurrentScope(),
    hasPermission('master.centers.create'),
    hasPermission('master.centers.update'),
    hasPermission('master.centers.export'),
  ])
  // 등록·일괄 사용 중지는 운영사(전체 범위)만
  const all = scope.kind === 'ALL'

  return (
    <CentersList
      actions={
        canCreate &&
        all && (
          <Button asChild>
            <Link href="/admin/master/centers/new">
              <PlusIcon />
              센터 등록
            </Link>
          </Button>
        )
      }
      canBulkUpdate={canUpdate && all}
      canExport={canExport}
    />
  )
}
