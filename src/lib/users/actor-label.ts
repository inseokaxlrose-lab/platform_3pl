import 'server-only'
import { SYSTEM_ACTOR } from '@/lib/actor'
import { prisma } from '@/lib/prisma'

// 등록·수정자 칸(아이디)을 화면 표시용으로: '김운영 (kim)' / 시스템·시드 → '시스템'
// 지워졌거나 모르는 아이디는 아이디 그대로
export async function actorLabel(username: string): Promise<string> {
  if (username === SYSTEM_ACTOR || username === 'seed') return '시스템'
  const user = await prisma.user.findUnique({
    where: { username },
    select: { name: true, displayUsername: true },
  })
  return user ? `${user.name} (${user.displayUsername ?? username})` : username
}
