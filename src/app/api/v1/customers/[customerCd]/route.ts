import { apiRoute } from '@/lib/api/api-route'
import { getCustomer } from '@/lib/api/endpoints/customers'

// 거래처 상세 (납품처 포함, 0082 ③)
export const GET = apiRoute({
  apiCode: 'CUSTOMER_GET',
  scope: 'CUSTOMER_READ',
  handler: async (ctx) => ({ data: await getCustomer(ctx) }),
})
