import { buildOpenApi } from '@/lib/api/openapi'

// GET /api/v1/openapi.json — 화주 연동 API 명세 (키 없이 열람, 비밀 정보 없음, 0081)
export function GET(request: Request) {
  const origin = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin
  return Response.json(buildOpenApi(origin), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
