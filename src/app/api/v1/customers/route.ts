import { apiRoute } from '@/lib/api/api-route'
import { getCustomers, postCustomers } from '@/lib/api/endpoints/customers'

// 거래처 API (0082 ③): POST 거래처 upsert(납품처 포함 가능, 최대 500건) / GET 목록(updatedAfter·cursor)
export const POST = apiRoute({
  apiCode: 'CUSTOMER_UPSERT',
  scope: 'CUSTOMER_WRITE',
  write: true,
  handler: postCustomers,
})

export const GET = apiRoute({
  apiCode: 'CUSTOMER_LIST',
  scope: 'CUSTOMER_READ',
  handler: async (ctx) => ({ data: await getCustomers(ctx) }),
})
