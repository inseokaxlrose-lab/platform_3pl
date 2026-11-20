import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getRouteOptions } from './queries'
import { RoutesList } from './routes-list'

export const metadata: Metadata = { title: '배송 코스' }

// 배송 코스 (0095): 센터 직원은 소속 센터 코스만
export default async function RoutesPage() {
  if (!(await hasPermission('master.routes.read'))) return <AccessDenied />
  const [options, create, update, remove, exportAll] = await Promise.all([
    getRouteOptions(await getCurrentScope()),
    hasPermission('master.routes.create'),
    hasPermission('master.routes.update'),
    hasPermission('master.routes.delete'),
    hasPermission('master.routes.export'),
  ])
  return (
    <RoutesList options={options} can={{ create, update, delete: remove, export: exportAll }} />
  )
}
