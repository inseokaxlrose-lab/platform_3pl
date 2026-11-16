import 'server-only'
import { prisma } from '@/lib/prisma'
import { PREF_DEFAULTS, PREF_SCHEMAS, type PrefKey, type PrefValue } from './pref-schemas'

// 사용자 개인 설정 읽기 (화면 조회용). 없거나 모양이 깨졌으면 기본값
export async function getUserPref<K extends PrefKey>(
  userId: bigint,
  key: K,
): Promise<PrefValue<K>> {
  const row = await prisma.userPref.findUnique({
    where: { userId_prefKey: { userId, prefKey: key } },
    select: { value: true },
  })
  const parsed = PREF_SCHEMAS[key].safeParse(row?.value)
  return (parsed.success ? parsed.data : PREF_DEFAULTS[key]) as PrefValue<K>
}
