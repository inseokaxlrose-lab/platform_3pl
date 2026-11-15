import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { LocationsList } from './locations-list'
import { getWarehouseOptions } from './queries'

export const metadata: Metadata = { title: '로케이션' }

// 로케이션 목록 (docs/decisions/0028): 센터 직원은 소속 센터 창고의 로케이션만
// 검색 조건은 주소창에 (예: 창고 상세의 [로케이션 관리] → ?warehouse=창고id)
export default async function LocationsPage() {
  if (!(await hasPermission('master.locations.read'))) return <AccessDenied />
  const [warehouses, canCreate, canUpdate, canDelete, canExport] = await Promise.all([
    getWarehouseOptions(await getCurrentScope()),
    hasPermission('master.locations.create'),
    hasPermission('master.locations.update'),
    hasPermission('master.locations.delete'),
    hasPermission('master.locations.export'),
  ])

  return (
    <LocationsList
      warehouses={warehouses}
      can={{ create: canCreate, update: canUpdate, delete: canDelete, export: canExport }}
    />
  )
}
