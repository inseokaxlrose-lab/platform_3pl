import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getCenterOptions } from '../warehouses/queries'
import { DeliveryZonesList } from './delivery-zones-list'

export const metadata: Metadata = { title: '배송권역' }

// 배송권역 목록 (docs/decisions/0033): 센터 직원은 소속 센터 권역만 보인다
export default async function DeliveryZonesPage() {
  if (!(await hasPermission('master.delivery-zones.read'))) return <AccessDenied />
  const [centers, canCreate, canUpdate, canDelete, canExport] = await Promise.all([
    getCenterOptions(await getCurrentScope()),
    hasPermission('master.delivery-zones.create'),
    hasPermission('master.delivery-zones.update'),
    hasPermission('master.delivery-zones.delete'),
    hasPermission('master.delivery-zones.export'),
  ])

  return (
    <DeliveryZonesList
      centers={centers}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/master/delivery-zones/new">
              <PlusIcon />
              권역 등록
            </Link>
          </Button>
        )
      }
      can={{ update: canUpdate, delete: canDelete, export: canExport }}
    />
  )
}
