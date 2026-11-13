import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/common'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterOptions } from './queries'
import { WarehousesGrid } from './warehouses-grid'

export const metadata: Metadata = { title: '창고' }

// 창고 목록 (docs/decisions/0027): 센터 직원은 소속 센터의 창고만 보인다
export default async function WarehousesPage() {
  if (!(await hasPermission('master.warehouses.read'))) return <AccessDenied />
  const [centers, canCreate] = await Promise.all([
    getCenterOptions(await getCurrentScope()),
    hasPermission('master.warehouses.create'),
  ])

  return (
    <>
      <PageHeader
        title="창고"
        description="센터 안의 보관 구역을 관리합니다. 입고대기 창고는 센터마다 자동으로 하나씩 있습니다."
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
      />
      <WarehousesGrid centers={centers} />
    </>
  )
}
