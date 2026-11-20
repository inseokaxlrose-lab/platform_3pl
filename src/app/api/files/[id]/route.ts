import { readFileFor } from '@/lib/files/files'
import { parseId } from '@/lib/id'
import { getCurrentScope, getCurrentUser } from '@/lib/session'

// 첨부파일 내려받기 (docs/decisions/0091): 로그인 + 같은 운영사 + 대상이 데이터 범위 안일 때만
// 없거나 볼 수 없으면 똑같이 404 (있는지 여부를 알려 주지 않는다)
export async function GET(_request: Request, { params }: RouteContext<'/api/files/[id]'>) {
  const user = await getCurrentUser()
  if (!user || user.passwordChangeRequired) return new Response(null, { status: 401 })
  const id = parseId((await params).id)
  const file = id === null ? null : await readFileFor(await getCurrentScope(), id)
  if (!file) return new Response(null, { status: 404 })
  return new Response(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.bytes.length),
      // 사람마다 볼 수 있는 파일이 달라 공유 캐시에 두지 않는다
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
