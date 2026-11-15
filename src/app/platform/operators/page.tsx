import { PlusIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccessDenied } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/session'
import { OperatorsList } from './operators-list'

export const metadata: Metadata = { title: '운영사' }

// 플랫폼 · 운영사 목록 (0039)
export default async function PlatformOperatorsPage() {
  if (!(await hasPermission('platform.operators.read'))) return <AccessDenied />
  const canCreate = await hasPermission('platform.operators.create')
  return (
    <OperatorsList
      actions={
        canCreate && (
          <Button asChild>
            <Link href="/platform/operators/new">
              <PlusIcon />
              운영사 등록
            </Link>
          </Button>
        )
      }
    />
  )
}
