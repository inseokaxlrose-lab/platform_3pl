import 'server-only'
import { prisma } from '@/lib/prisma'
import { isActiveStatus } from '@/lib/status'
import { computeScope, type DataScope } from './data-scope'
import { isCenterInScopeStatus } from '@/lib/centers/center-status'
import { isShipperInScopeStatus } from '@/lib/shippers/shipper-codes'

// 사용자의 데이터 범위를 DB에서 읽어 계산한다 (사용자가 없으면 NONE)
export async function loadDataScope(userId: bigint): Promise<DataScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      operatorId: true,
      userType: true,
      status: true,
      centers: { select: { center: { select: { id: true, status: true } } } },
      shipper: { select: { id: true, status: true } },
    },
  })
  if (!user) return { kind: 'NONE' }

  // 상태(status_cd) → 사용 여부로 바꿔 계산
  return computeScope({
    operatorId: user.operatorId,
    userType: user.userType,
    isActive: isActiveStatus(user.status),
    // 소속 센터: 폐쇄만 범위에서 뺀다 (준비중·일시중지는 기준정보 정리를 위해 보인다, 0073)
    centers: user.centers.map(({ center }) => ({
      id: center.id,
      isActive: isCenterInScopeStatus(center.status),
    })),
    // 소속 화주사: 해지만 범위에서 뺀다 (일시정지는 조회만 — 새 업무는 상태 검사로 막힌다, 0080)
    shipper: user.shipper && {
      id: user.shipper.id,
      isActive: isShipperInScopeStatus(user.shipper.status),
    },
  })
}
