import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { prisma, type Db } from '@/lib/prisma'
import { NOT_DELETED, isActiveStatus, withIsActive } from '@/lib/status'
import type { CodeOptions } from './code-options'

// 공통코드 읽기·검사 (docs/decisions/0030)

// 화면에 나눠 줄 전체 목록: 사용 중인 그룹의 코드 (사용 중지된 코드도 표시용으로 포함)
// 코드 수가 수백 개 수준이라 화면 틀(AppShell)이 요청마다 한 번에 읽는다
// 공통코드는 운영사마다 따로 → 내 운영사 것만 (운영사가 없으면 빈 목록, 0039)
export async function loadCodeOptions(operatorId: bigint | undefined): Promise<CodeOptions> {
  if (operatorId === undefined) return {}
  const groups = await prisma.codeGroup.findMany({
    where: { operatorId, status: 'ACTIVE' },
    select: {
      code: true,
      items: {
        where: NOT_DELETED,
        select: { code: true, name: true, status: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      },
    },
  })
  // 화면에는 사용 여부(true/false)로
  return Object.fromEntries(groups.map((group) => [group.code, group.items.map(withIsActive)]))
}

// 저장 전 검사: 값들이 모두 그 그룹의 "사용 중인" 코드인지
// keep: 이미 저장돼 있던 값 → 그 사이 사용 중지됐어도 그대로 두는 것은 허용 (다시 고르라고 막지 않는다)
export async function assertCodeValues(
  db: Db,
  groupCode: string,
  values: readonly string[],
  { label, keep = [] }: { label: string; keep?: readonly string[] },
) {
  const wanted = [...new Set(values)]
  if (wanted.length === 0) return
  const items = await db.codeItem.findMany({
    where: { group: { code: groupCode, ...NOT_DELETED }, code: { in: wanted } },
    select: { code: true, status: true, group: { select: { status: true } } },
  })
  const usable = new Set(
    items
      .filter(
        (item) =>
          (isActiveStatus(item.status) && isActiveStatus(item.group.status)) ||
          keep.includes(item.code),
      )
      .map((item) => item.code),
  )
  const invalid = wanted.filter((value) => !usable.has(value))
  if (invalid.length > 0) {
    throw new ActionError(
      'VALIDATION',
      `${label}에 쓸 수 없는 코드입니다: ${invalid.join(', ')} (공통코드에서 사용 중인지 확인해 주세요)`,
    )
  }
}
