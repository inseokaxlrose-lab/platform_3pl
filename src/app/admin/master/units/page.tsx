import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { UnitsList } from './units-list'

export const metadata: Metadata = { title: '단위' }

// 단위 관리 (docs/decisions/0034): 전체 공통 기준정보 (데이터 범위 없음)
export default async function UnitsPage() {
  if (!(await hasPermission('master.units.read'))) return <AccessDenied />
  const [create, update, remove] = await Promise.all([
    hasPermission('master.units.create'),
    hasPermission('master.units.update'),
    hasPermission('master.units.delete'),
  ])
  return <UnitsList can={{ create, update, delete: remove }} />
}
