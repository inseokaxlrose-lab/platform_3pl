import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterOptions } from '../warehouses/queries'
import { ShippersList } from './shippers-list'

export const metadata: Metadata = { title: '화주사' }

// 화주사 목록 (docs/decisions/0035): 센터 직원은 자기 센터를 이용하는 화주사만 보인다
export default async function ShippersPage() {
  if (!(await hasPermission('master.shippers.read'))) return <AccessDenied />
  const scope = await getCurrentScope()
  const [centers, canCreate, canUpdate, canExport] = await Promise.all([
    getCenterOptions(scope),
    hasPermission('master.shippers.create'),
    hasPermission('master.shippers.update'),
    hasPermission('master.shippers.export'),
  ])
  // 등록·일괄 사용 중지는 운영사(전체 범위)만
  const all = scope.kind === 'ALL'

  return (
    <ShippersList
      centers={centers}
      actions={
        canCreate &&
        all && (
          <Button asChild>
            <Link href="/admin/master/shippers/new">
              <PlusIcon />
              화주사 등록
            </Link>
          </Button>
        )
      }
      canBulkUpdate={canUpdate && all}
      canExport={canExport}
    />
  )
}
