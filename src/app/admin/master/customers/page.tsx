import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { getCustomerShipperOptions } from '@/lib/customers/customer-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CustomersList } from './customers-list'

export const metadata: Metadata = { title: '거래처' }

// 거래처 목록 (docs/decisions/0043)
export default async function CustomersPage() {
  if (!(await hasPermission('master.customers.read'))) return <AccessDenied />
  const [shippers, canCreate, canUpdate, canDelete, canExport] = await Promise.all([
    getCustomerShipperOptions(await getCurrentScope()),
    hasPermission('master.customers.create'),
    hasPermission('master.customers.update'),
    hasPermission('master.customers.delete'),
    hasPermission('master.customers.export'),
  ])
  return (
    <CustomersList
      shippers={shippers}
      can={{ update: canUpdate, delete: canDelete, export: canExport }}
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/admin/master/customers/new">
              <PlusIcon />
              거래처 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
