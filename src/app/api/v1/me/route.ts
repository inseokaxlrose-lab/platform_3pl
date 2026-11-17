import { apiRoute } from '@/lib/api/api-route'
import { getMe } from '@/lib/api/endpoints/me'

// GET /api/v1/me — 이 키의 화주·환경·권한·이용 센터 (연동 테스트용, 0081)
export const GET = apiRoute({
  apiCode: 'ME',
  handler: async (ctx) => ({ data: await getMe(ctx) }),
})
