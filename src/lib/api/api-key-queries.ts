import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { isInScope, type DataScope } from '@/lib/scope/data-scope'
import { maskedKey } from './api-key'

// 화주사 편집 화면 "API 키" 섹션: 이 화주의 키 목록 (운영사 사용자만, 0081)
// 원문·해시는 보내지 않는다 — 식별부를 가린 모양(live_ak7f2c9x_••••)만
export async function getShipperApiKeys(shipperId: bigint, scope: DataScope) {
  if (scope.kind !== 'ALL') return []
  const keys = await prisma.apiClient.findMany({
    where: { shipperId },
    select: {
      id: true,
      operatorId: true,
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
      revokedAt: true,
      revokeReason: true,
      rowVersion: true,
      scopes: { select: { scope: true } },
      ips: { select: { ipCidr: true, description: true }, orderBy: { id: 'asc' } },
    },
    // 사용 중 먼저, 그 안에서 최근 발급 순
    orderBy: [{ status: 'asc' }, { issuedAt: 'desc' }],
  })
  const now = Date.now()
  return textIds(
    keys
      .filter((key) => isInScope(scope, key, {}))
      .map(({ operatorId, keyPrefix, scopes, ips, expiresAt, ...key }) => {
        void operatorId
        return {
          ...key,
          key: maskedKey(key.env, keyPrefix),
          scopes: scopes.map((s) => s.scope),
          ips: ips.map((ip) => ({ ipCidr: ip.ipCidr, description: ip.description ?? '' })),
          expiresAt,
          // 만료 예정: 사용 중이고 14일 안에 만료 (화면 배지)
          expiringSoon:
            key.status === 'ACTIVE' &&
            expiresAt !== null &&
            expiresAt.getTime() - now < 14 * 86_400_000,
          // 수정 팝업의 만료일 칸 (한국 날짜)
          expiresOn: expiresAt
            ? expiresAt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
            : '',
        }
      }),
  )
}

export type ShipperApiKey = Awaited<ReturnType<typeof getShipperApiKeys>>[number]
