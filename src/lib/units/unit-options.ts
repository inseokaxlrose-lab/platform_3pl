import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { sharedOperatorFilter, type DataScope } from '@/lib/scope/data-scope'
import { isActiveStatus } from '@/lib/status'

// UnitSelect 선택지 (docs/decisions/0078): 시스템 기본 단위 + 이 운영사의 단위, 정렬순서 → 코드 순
// 사용 중지 단위도 함께 보낸다 (지금 저장된 값 표시·조회 화면용 — 고르기 목록에서는 UnitSelect가 뺀다)
export async function getUnitOptions(scope: DataScope) {
  const rows = await prisma.unit.findMany({
    where: sharedOperatorFilter(scope),
    select: { id: true, code: true, name: true, type: true, decimals: true, status: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  return textIds(rows.map(({ status, ...u }) => ({ ...u, isActive: isActiveStatus(status) })))
}
