import { apiRoute } from '@/lib/api/api-route'
import { getItems, postItems } from '@/lib/api/endpoints/items'

// 품목 API (0083 ③): POST 품목 upsert(단위·팔레트·바코드 포함, 최대 500건) / GET 목록(updatedAfter·cursor)
export const POST = apiRoute({
  apiCode: 'ITEM_UPSERT',
  scope: 'ITEM_WRITE',
  write: true,
  handler: postItems,
})

export const GET = apiRoute({
  apiCode: 'ITEM_LIST',
  scope: 'ITEM_READ',
  handler: async (ctx) => ({ data: await getItems(ctx) }),
})
