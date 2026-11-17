import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { getCustomerShipperOptions } from '@/lib/customers/customer-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { ShipTosList } from './ship-tos-list'

export const metadata: Metadata = { title: '납품처' }

// 납품처 목록 (docs/decisions/0082 ②) — 권한은 거래처와 같다
export default async function ShipTosPage() {
  if (!(await hasPermission('master.customers.read'))) return <AccessDenied />
  const [shippers, canUpdate, canExport] = await Promise.all([
    getCustomerShipperOptions(await getCurrentScope()),
    hasPermission('master.customers.update'),
    hasPermission('master.customers.export'),
  ])
  // 배송센터 선택지: 범위 안 화주들이 이용하는 센터 (겹치면 하나만)
  const centers = [
    ...new Map(shippers.flatMap((s) => s.centers).map((c) => [c.id, c])).values(),
  ].sort((a, b) => a.code.localeCompare(b.code))
  return (
    <ShipTosList
      shippers={shippers.map(({ id, code, name }) => ({ id, code, name }))}
      centers={centers}
      can={{ update: canUpdate, export: canExport }}
    />
  )
}
