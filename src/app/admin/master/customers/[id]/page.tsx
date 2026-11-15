import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatDate } from '@/components/data-grid'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCustomerForEdit } from '@/lib/customers/customer-queries'
import { parseId } from '@/lib/id'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { actorLabel } from '@/lib/users/actor-label'
import { CustomerForm } from '../customer-form'

export const metadata: Metadata = { title: '거래처 수정' }

// 거래처 수정 (범위 밖이면 "찾을 수 없음", 0043)
export default async function CustomerPage({ params }: PageProps<'/admin/master/customers/[id]'>) {
  if (!(await hasPermission('master.customers.read'))) return <AccessDenied />
  const id = parseId((await params).id)
  if (id === null) notFound()
  const [customer, canUpdate] = await Promise.all([
    getCustomerForEdit(id, await getCurrentScope()),
    hasPermission('master.customers.update'),
  ])
  if (!customer) notFound()

  return (
    <CustomerForm
      header={{
        title: `${customer.input.name} (${customer.input.code})`,
        description: customer.shipper,
        meta: `마지막 수정: ${await actorLabel(customer.updatedBy)} · ${formatDate(new Date(customer.updatedAt), true)}`,
        actions: <BackToListButton listPath="/admin/master/customers" />,
      }}
      shippers={[]}
      customer={customer}
      readOnly={!canUpdate}
      canToggleActive={canUpdate}
    />
  )
}
