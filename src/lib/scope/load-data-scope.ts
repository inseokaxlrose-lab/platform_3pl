import 'server-only'
import { prisma } from '@/lib/prisma'
import { computeScope, type DataScope } from './data-scope'

// 사용자의 데이터 범위를 DB에서 읽어 계산한다 (사용자가 없으면 NONE)
export async function loadDataScope(userId: string): Promise<DataScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      userType: true,
      isActive: true,
      centers: { select: { center: { select: { id: true, isActive: true } } } },
      shipper: { select: { id: true, isActive: true } },
    },
  })
  if (!user) return { kind: 'NONE' }

  return computeScope({
    userType: user.userType,
    isActive: user.isActive,
    centers: user.centers.map(({ center }) => center),
    shipper: user.shipper,
  })
}
