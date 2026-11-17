import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { RegionSettings } from './region-settings'

export const metadata: Metadata = { title: '권역설정' }

// 권역설정 (docs/decisions/0076): 우편번호별 배송센터 배정
export default async function RegionsPage() {
  if (!(await hasPermission('master.regions.read'))) return <AccessDenied />
  const [canUpdate, canExport] = await Promise.all([
    hasPermission('master.regions.update'),
    hasPermission('master.regions.export'),
  ])
  return <RegionSettings canUpdate={canUpdate} canExport={canExport} />
}
