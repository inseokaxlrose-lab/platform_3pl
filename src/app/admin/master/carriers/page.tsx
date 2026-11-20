import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { CarriersList } from './carriers-list'

export const metadata: Metadata = { title: '운송사' }

// 운송사 (0094): 택배사·화물·자차·용차
export default async function CarriersPage() {
  if (!(await hasPermission('master.carriers.read'))) return <AccessDenied />
  const [create, update, remove] = await Promise.all([
    hasPermission('master.carriers.create'),
    hasPermission('master.carriers.update'),
    hasPermission('master.carriers.delete'),
  ])
  return <CarriersList can={{ create, update, delete: remove }} />
}
