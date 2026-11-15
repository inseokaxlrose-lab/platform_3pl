import 'server-only'
import { prisma } from '@/lib/prisma'
import { isActiveStatus, withIsActive } from '@/lib/status'
import { computeScope, type DataScope } from './data-scope'

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
    centers: user.centers.map(({ center }) => withIsActive(center)),
    shipper: user.shipper && withIsActive(user.shipper),
  })
}
