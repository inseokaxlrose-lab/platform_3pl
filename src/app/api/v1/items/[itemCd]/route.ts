import { apiRoute } from '@/lib/api/api-route'
import { getItem } from '@/lib/api/endpoints/items'

// 품목 상세 (단위·바코드·PLT 계산값 포함, 0083 ③)
export const GET = apiRoute({
  apiCode: 'ITEM_GET',
  scope: 'ITEM_READ',
  handler: async (ctx) => ({ data: await getItem(ctx) }),
})
