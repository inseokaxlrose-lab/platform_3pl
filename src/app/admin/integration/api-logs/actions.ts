'use server'

import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { apiLogWhere } from '@/lib/api/api-log-filters'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'

// API 호출 이력 (docs/decisions/0081 ②) — 운영사 사용자(전체 범위)만
// 서버 액션 안이라 prisma.ts가 이 운영사의 로그만 자동으로 거른다 (키 확인 전에 실패한 요청은 운영사를 몰라 보이지 않는다)

function requireAllScope(scope: DataScope) {
  if (scope.kind !== 'ALL') {
    throw new ActionError('FORBIDDEN', 'API 호출 이력은 운영사 사용자만 볼 수 있습니다.')
  }
}

export const listApiLogsAction = createAction({
  permission: 'integration.api-logs.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    requireAllScope(scope)
    if (input.exportAll && !permissions.has('integration.api-logs.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    const query = toPrismaQuery(input, {
      searchFields: ['requestId', 'path'],
      sortable: {
        requestedAt: 'requestedAt',
        apiCode: 'apiCode',
        result: 'result',
        durationMs: 'durationMs',
        httpStatus: 'httpStatus',
      },
      defaultOrderBy: { requestedAt: 'desc' },
    })
    const where = { AND: [query.where, apiLogWhere(input.filters)] }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.apiRequestLog.findMany({
        ...query,
        where,
        select: {
          requestId: true,
          shipperId: true,
          apiClientId: true,
          env: true,
          apiCode: true,
          httpMethod: true,
          path: true,
          clientIp: true,
          requestedAt: true,
          durationMs: true,
          httpStatus: true,
          result: true,
          totalCount: true,
          successCount: true,
          failCount: true,
          errorCode: true,
        },
      }),
      prisma.apiRequestLog.count({ where }),
    ])
    // 화주·키 이름 붙이기 (로그 표는 화주·키와 관계를 두지 않는다 — 지워진 키의 로그도 남게)
    const shipperIds = [...new Set(rows.flatMap((r) => (r.shipperId ? [r.shipperId] : [])))]
    const keyIds = [...new Set(rows.flatMap((r) => (r.apiClientId ? [r.apiClientId] : [])))]
    const [shippers, keys] = await Promise.all([
      prisma.shipper.findMany({
        where: { id: { in: shipperIds } },
        select: { id: true, code: true, name: true },
      }),
      prisma.apiClient.findMany({
        where: { id: { in: keyIds } },
        select: { id: true, name: true, keyPrefix: true },
      }),
    ])
    const shipperOf = new Map(shippers.map((s) => [s.id, `${s.name} (${s.code})`]))
    const keyOf = new Map(keys.map((k) => [k.id, `${k.name} (${k.keyPrefix})`]))
    return {
      rows: rows.map((row) => ({
        ...row,
        id: row.requestId,
        shipper: row.shipperId ? (shipperOf.get(row.shipperId) ?? null) : null,
        key: row.apiClientId ? (keyOf.get(row.apiClientId) ?? null) : null,
        counts:
          row.totalCount > 0 ? `${row.totalCount} / ${row.successCount} / ${row.failCount}` : null,
      })),
      rowCount,
    }
  },
})
