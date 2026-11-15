import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { getCustomerShipperOptions } from '@/lib/customers/customer-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CustomerForm } from '../customer-form'

export const metadata: Metadata = { title: '거래처 등록' }

// 거래처 등록 (데이터 범위 안의 화주사에만, 0043)
export default async function NewCustomerPage() {
  if (!(await hasPermission('master.customers.create'))) return <AccessDenied />
  const shippers = await getCustomerShipperOptions(await getCurrentScope())
  return (
    <CustomerForm
      header={{
        title: '거래처 등록',
        description: '거래처코드를 비우면 자동으로 부여되는 시스템 코드를 그대로 씁니다.',
        actions: <BackToListButton listPath="/admin/master/customers" />,
      }}
      shippers={shippers}
      readOnly={false}
    />
  )
}
