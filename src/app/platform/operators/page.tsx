import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { hasPermission } from '@/lib/session'
import { OperatorsList } from './operators-list'

export const metadata: Metadata = { title: '운영사' }

// 플랫폼 · 운영사 목록 (0039)
export default async function PlatformOperatorsPage() {
  if (!(await hasPermission('platform.operators.read'))) return <AccessDenied />
  return <OperatorsList />
}
