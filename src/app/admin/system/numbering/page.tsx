import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { NumberingList } from './numbering-list'

export const metadata: Metadata = { title: '체번 규칙' }

// 체번 규칙 (docs/decisions/0085)
export default async function NumberingPage() {
  if (!(await hasPermission('system.numbering.read'))) return <AccessDenied />
  return <NumberingList />
}
