import { apiRoute } from '@/lib/api/api-route'
import { getShipTos, postShipTos } from '@/lib/api/endpoints/partners'

// 납품처 API (0082 ③): POST 납품처 upsert(최대 500건) / GET 목록
export const POST = apiRoute({
  apiCode: 'SHIP_TO_UPSERT',
  scope: 'PARTNER_WRITE',
  write: true,
  handler: postShipTos,
})

export const GET = apiRoute({
  apiCode: 'SHIP_TO_LIST',
  scope: 'PARTNER_READ',
  handler: async (ctx) => ({ data: await getShipTos(ctx) }),
})
