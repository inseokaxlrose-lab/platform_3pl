import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { operatorFilter } from '@/lib/scope/data-scope'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { ApiKeysList } from './api-keys-list'

export const metadata: Metadata = { title: 'API 키' }

// 연동 > API 키 (0081): 운영사 사용자(전체 범위)만
export default async function ApiKeysPage() {
  const scope = await getCurrentScope()
  if (!(await hasPermission('integration.api-keys.read')) || scope.kind !== 'ALL') {
    return <AccessDenied />
  }
  const shippers = await prisma.shipper.findMany({
    where: operatorFilter(scope),
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  })
  return <ApiKeysList shippers={textIds(shippers)} />
}
