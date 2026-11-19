import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { PalletTypesList } from './pallet-types-list'

export const metadata: Metadata = { title: '팔레트 종류' }

// 팔레트 종류 (0083) — 권한은 단위 관리와 같다
export default async function PalletTypesPage() {
  if (!(await hasPermission('master.units.read'))) return <AccessDenied />
  const [create, update, remove] = await Promise.all([
    hasPermission('master.units.create'),
    hasPermission('master.units.update'),
    hasPermission('master.units.delete'),
  ])
  return <PalletTypesList can={{ create, update, delete: remove }} />
}
