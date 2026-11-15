import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterOptions } from './queries'
import { WarehousesList } from './warehouses-list'

export const metadata: Metadata = { title: '창고' }

// 창고 목록 (docs/decisions/0027): 센터 직원은 소속 센터의 창고만 보인다
export default async function WarehousesPage() {
  if (!(await hasPermission('master.warehouses.read'))) return <AccessDenied />
  const [centers, canCreate, canUpdate, canExport] = await Promise.all([
    getCenterOptions(await getCurrentScope()),
    hasPermission('master.warehouses.create'),
    hasPermission('master.warehouses.update'),
    hasPermission('master.warehouses.export'),
  ])

  return (
    <WarehousesList
      centers={centers}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/master/warehouses/new">
              <PlusIcon />
              창고 등록
            </Link>
          </Button>
        )
      }
      canBulkUpdate={canUpdate}
      canExport={canExport}
    />
  )
}
