'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema, toPrismaQuery } from '@/lib/grid/grid-query'
import { codesFilter, idFilter } from '@/lib/grid/list-filters'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { assertInScope, type DataScope } from '@/lib/scope/data-scope'
import { maskedKey } from '@/lib/api/api-key'
import { apiKeyIssueSchema, apiKeyRevokeSchema, apiKeyUpdateSchema } from '@/lib/api/api-key-schema'
import { issueApiKey, revokeApiKey, updateApiKey } from '@/lib/api/api-keys'

// API 키 관리 서버 액션 (docs/decisions/0081) — 운영사 사용자(전체 범위)만
// 키 원문은 발급 응답에서 한 번만 돌려준다 (화면이 한 번 보여 주고 버린다)

function requireAllScope(scope: DataScope) {
  if (scope.kind !== 'ALL') {
    throw new ActionError('FORBIDDEN', 'API 키는 운영사 사용자만 관리할 수 있습니다.')
  }
}

async function assertKeyInScope(scope: DataScope, id: bigint) {
  const key = await prisma.apiClient.findUnique({ where: { id }, select: { operatorId: true } })
  assertInScope(scope, key, {})
}

const DAY = 86_400_000

// 목록 (연동 > API 키): 검색어(화주·키 이름·식별부)·화주·환경·상태·만료 예정
export const listApiKeysAction = createAction({
  permission: 'integration.api-keys.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) => {
    requireAllScope(scope)
    const { filters } = input
    const query = toPrismaQuery(input, {
      searchFields: ['name', 'keyPrefix', 'shipper.code', 'shipper.name'],
      sortable: {
        shipper: 'shipper.code',
        name: 'name',
        env: 'env',
        status: 'status',
        expiresAt: 'expiresAt',
        lastUsedAt: 'lastUsedAt',
        issuedAt: 'issuedAt',
      },
      defaultOrderBy: { issuedAt: 'desc' },
    })
    const shipper = idFilter(filters, 'shipper')
    const where = {
      AND: [
        query.where,
        shipper ? { shipperId: shipper } : {},
        codesFilter(filters, 'env') ? { env: codesFilter(filters, 'env') } : {},
        codesFilter(filters, 'status') ? { status: codesFilter(filters, 'status') } : {},
        // 만료 예정: 사용 중이고 14일 안에 만료
        filters.expiring === 'Y'
          ? { status: 'ACTIVE', expiresAt: { not: null, lte: new Date(Date.now() + 14 * DAY) } }
          : {},
      ],
    }
    const [rows, rowCount] = await prisma.$transaction([
      prisma.apiClient.findMany({
        ...query,
        where,
        select: {
          id: true,
          name: true,
          env: true,
          keyPrefix: true,
          status: true,
          expiresAt: true,
          rateLimitPerMin: true,
          lastUsedAt: true,
          lastUsedIp: true,
          issuedAt: true,
          issuedBy: true,
          shipper: { select: { id: true, code: true, name: true } },
          scopes: { select: { scope: true } },
          _count: { select: { ips: true } },
        },
      }),
      prisma.apiClient.count({ where }),
    ])
    return {
      rows: rows.map(({ shipper: s, scopes, _count, keyPrefix, ...row }) => ({
        ...row,
        shipperId: s.id,
        shipper: `${s.name} (${s.code})`,
        key: maskedKey(row.env, keyPrefix),
        scopes: scopes.map((x) => x.scope),
        ipCount: _count.ips,
      })),
      rowCount,
    }
  },
})

// 발급: 원문은 이 응답에서만
export const issueApiKeyAction = createAction({
  permission: 'integration.api-keys.create',
  input: apiKeyIssueSchema,
  handler: async ({ input, scope }) => {
    requireAllScope(scope)
    const shipper = await prisma.shipper.findUnique({
      where: { id: input.shipperId },
      select: { id: true, operatorId: true },
    })
    assertInScope(scope, shipper, { shipper: 'id' })
    return issueApiKey(input)
  },
})

export const updateApiKeyAction = createAction({
  permission: 'integration.api-keys.update',
  input: apiKeyUpdateSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    requireAllScope(scope)
    await assertKeyInScope(scope, id)
    return updateApiKey(id, rowVersion, data)
  },
})

// 폐기: 사유 필수, 즉시 효력
export const revokeApiKeyAction = createAction({
  permission: 'integration.api-keys.update',
  input: apiKeyRevokeSchema.extend({ id: idSchema }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope)
    await assertKeyInScope(scope, input.id)
    return revokeApiKey(input.id, input.reason)
  },
})

// 키 이력 (수정 팝업 아래에 보인다)
export const listApiKeyEventsAction = createAction({
  permission: 'integration.api-keys.read',
  input: z.object({ id: idSchema }),
  handler: async ({ input, scope }) => {
    requireAllScope(scope)
    await assertKeyInScope(scope, input.id)
    return prisma.apiClientEvent.findMany({
      where: { apiClientId: input.id },
      select: { id: true, event: true, detail: true, actor: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  },
})
