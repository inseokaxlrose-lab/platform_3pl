import type { Metadata } from 'next'
import { AccessDenied } from '@/components/permission'
import { prisma } from '@/lib/prisma'
import { getCurrentScope, hasPermission } from '@/lib/session'
import { getOperatorDisplayUnits } from '@/lib/units/display-units'
import { ALWAYS_ACTIVE_UNIT_CODES } from '@/lib/units/unit-status'
import { UnitsList } from './units-list'

export const metadata: Metadata = { title: '단위' }

// 단위 관리 (docs/decisions/0034): 전체 공통 기준정보 (데이터 범위 없음)
export default async function UnitsPage() {
  if (!(await hasPermission('master.units.read'))) return <AccessDenied />
  const scope = await getCurrentScope()
  const [create, update, remove, display] = await Promise.all([
    hasPermission('master.units.create'),
    hasPermission('master.units.update'),
    hasPermission('master.units.delete'),
    scope.operatorId === undefined ? null : getOperatorDisplayUnits(prisma, scope.operatorId),
  ])
  // 사용 중지할 수 없는 단위: EA·BOX·PLT + 운영사 중량·길이 표시 단위 (0079)
  const lockedCodes = [
    ...ALWAYS_ACTIVE_UNIT_CODES,
    ...(display ? [display.weight.code, display.length.code] : []),
  ]
  return <UnitsList can={{ create, update, delete: remove }} lockedCodes={lockedCodes} />
}
