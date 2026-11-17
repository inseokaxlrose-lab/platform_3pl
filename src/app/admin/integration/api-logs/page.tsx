import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { getApiLogSummary } from '@/lib/api/api-log-queries'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { operatorFilter } from '@/lib/scope/data-scope'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { ApiLogsList } from './api-logs-list'

export const metadata: Metadata = { title: 'API 호출 이력' }

// 연동 > API 호출 이력 (0081 ②): 운영사 사용자(전체 범위)만
export default async function ApiLogsPage() {
  const scope = await getCurrentScope()
  if (!(await hasPermission('integration.api-logs.read')) || scope.kind !== 'ALL') {
    return <AccessDenied />
  }
  const [shippers, keys, summary, canExport] = await Promise.all([
    prisma.shipper.findMany({
      where: operatorFilter(scope),
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.apiClient.findMany({
      where: operatorFilter(scope),
      select: { id: true, name: true, keyPrefix: true, shipper: { select: { code: true } } },
      orderBy: [{ shipper: { code: 'asc' } }, { issuedAt: 'desc' }],
    }),
    getApiLogSummary(scope),
    hasPermission('integration.api-logs.export'),
  ])
  return (
    <ApiLogsList
      shippers={textIds(shippers)}
      keys={textIds(keys.map(({ shipper, ...k }) => ({ ...k, shipperCode: shipper.code })))}
      summary={summary}
      canExport={canExport}
    />
  )
}
