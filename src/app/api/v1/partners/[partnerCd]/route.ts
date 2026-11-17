import { apiRoute } from '@/lib/api/api-route'
import { getPartner } from '@/lib/api/endpoints/partners'

// 거래처 상세 (납품처 포함, 0082 ③)
export const GET = apiRoute({
  apiCode: 'PARTNER_GET',
  scope: 'PARTNER_READ',
  handler: async (ctx) => ({ data: await getPartner(ctx) }),
})
