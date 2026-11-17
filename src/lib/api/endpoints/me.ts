import 'server-only'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { isYes } from '@/lib/yn'
import type { ApiHandlerContext } from '../api-route'

// GET /api/v1/me — 연동 테스트용: 이 키의 화주·환경·권한·이용 센터 (docs/decisions/0081)
// 권한이 따로 필요 없다 (키만 맞으면 됨). 화주 개발자가 키를 받고 가장 먼저 부르는 API

// 응답 data 모양 (OpenAPI 문서도 이 규칙으로 만든다)
export const meResponseSchema = z.object({
  client: z.object({
    code: z.string().describe('화주코드'),
    name: z.string().describe('화주명'),
    status: z.enum(['PREPARING', 'ACTIVE', 'SUSPENDED', 'TERMINATED']).describe('화주 상태'),
  }),
  key: z.object({
    name: z.string().describe('키 이름'),
    prefix: z.string().describe('키 식별부'),
    env: z.enum(['TEST', 'LIVE']).describe('환경 (TEST는 저장하지 않음)'),
    scopes: z.array(z.string()).describe('권한'),
    expiresAt: z.string().nullable().describe('만료일시 (ISO-8601, 없으면 무기한)'),
    rateLimitPerMin: z.number().int().describe('분당 호출 한도'),
  }),
  centers: z
    .array(
      z.object({
        code: z.string().describe('센터코드'),
        name: z.string().describe('센터명'),
        isDefault: z.boolean().describe('기본 센터 (ASN·주문에 센터가 없을 때 사용)'),
      }),
    )
    .describe('이용 중인 센터'),
})

export type MeResponse = z.infer<typeof meResponseSchema>

export async function getMe({ api }: ApiHandlerContext): Promise<MeResponse> {
  const shipper = await prisma.shipper.findUniqueOrThrow({
    where: { id: api.shipperId },
    select: {
      code: true,
      name: true,
      status: true,
      centers: {
        where: { status: 'ACTIVE' },
        select: { isDefault: true, center: { select: { code: true, name: true } } },
        orderBy: { startOn: 'asc' },
      },
    },
  })
  return {
    client: {
      code: shipper.code,
      name: shipper.name,
      status: shipper.status as MeResponse['client']['status'],
    },
    key: {
      name: api.keyName,
      prefix: api.keyPrefix,
      env: api.env,
      scopes: api.scopes,
      expiresAt: api.expiresAt?.toISOString() ?? null,
      rateLimitPerMin: api.rateLimitPerMin,
    },
    centers: shipper.centers
      .map((c) => ({ code: c.center.code, name: c.center.name, isDefault: isYes(c.isDefault) }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
  }
}
