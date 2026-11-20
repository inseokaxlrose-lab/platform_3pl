import { apiRoute } from '@/lib/api/api-route'
import { getPartners, postPartners } from '@/lib/api/endpoints/partners'

// 거래처 API (0082 ③): POST 거래처 upsert(납품처 포함 가능, 최대 500건) / GET 목록(updatedAfter·cursor)
export const POST = apiRoute({
  apiCode: 'PARTNER_UPSERT',
  scope: 'PARTNER_WRITE',
  write: true,
  handler: postPartners,
})

export const GET = apiRoute({
  apiCode: 'PARTNER_LIST',
  scope: 'PARTNER_READ',
  handler: async (ctx) => ({ data: await getPartners(ctx) }),
})
