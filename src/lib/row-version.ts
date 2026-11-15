import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'

// 동시 수정 막기 (낙관적 잠금, docs/db-conventions.md 공통 칸 row_version)
// 화면은 불러올 때의 버전을 들고 있다가 저장할 때 함께 보낸다.
// 그 사이 다른 사람이 저장했으면(버전이 올라갔으면) 덮어쓰지 않고 알린다.
// 버전 +1은 prisma.ts가 수정할 때마다 자동으로 한다

export const VERSION_CONFLICT_MESSAGE =
  '다른 사람이 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장해 주세요.'

// 입력 규칙: 화면이 불러온 버전
export const rowVersionField = z.number().int().positive()

// 저장 전 검사: 대상이 없으면 NOT_FOUND, 버전이 다르면 CONFLICT
export function assertRowVersion(
  current: { rowVersion: number } | null,
  expected: number,
  notFoundMessage = '대상을 찾을 수 없습니다.',
) {
  if (!current) throw new ActionError('NOT_FOUND', notFoundMessage)
  if (current.rowVersion !== expected) throw new ActionError('CONFLICT', VERSION_CONFLICT_MESSAGE)
}

// 검사와 저장 사이에 다른 저장이 끼어든 경우: 수정 조건에 버전을 넣어 두면
// Prisma가 '대상 없음'(P2025)으로 실패하므로 같은 충돌 문구로 바꾼다
// 예) await withVersionGuard(() => tx.center.update({ where: { id, rowVersion }, data }))
export async function withVersionGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      throw new ActionError('CONFLICT', VERSION_CONFLICT_MESSAGE)
    }
    throw error
  }
}
