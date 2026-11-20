import type { Metadata } from 'next'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { CarrierForm } from '../carrier-form'

export const metadata: Metadata = { title: '운송사 등록' }

// 운송사 등록 (0094)
export default async function NewCarrierPage() {
  if (!(await hasPermission('master.carriers.create'))) return <AccessDenied />
  return (
    <CarrierForm
      header={{
        title: '운송사 등록',
        actions: <BackToListButton listPath="/admin/master/carriers" />,
      }}
      readOnly={false}
    />
  )
}
