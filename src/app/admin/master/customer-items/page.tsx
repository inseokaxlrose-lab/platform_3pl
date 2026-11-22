import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { scopeFilter } from '@/lib/scope/data-scope'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { CustomerItemsList } from './customer-items-list'

export const metadata: Metadata = { title: '거래처별 품목코드' }

// 거래처별 품목코드 (0098): 범위는 거래처와 같다 (센터 직원은 소속 센터를 이용하는 화주사)
export default async function CustomerItemsPage() {
  if (!(await hasPermission('master.customer-items.read'))) return <AccessDenied />
  const scope = await getCurrentScope()
  const [shippers, create, update, remove, exportAll] = await Promise.all([
    prisma.shipper.findMany({
      where: scopeFilter(scope, { center: 'centers.some.centerId', shipper: 'id' }),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    hasPermission('master.customer-items.create'),
    hasPermission('master.customer-items.update'),
    hasPermission('master.customer-items.delete'),
    hasPermission('master.customer-items.export'),
  ])
  return (
    <CustomerItemsList
      shippers={textIds(shippers)}
      can={{ create, update, delete: remove, export: exportAll }}
    />
  )
}
