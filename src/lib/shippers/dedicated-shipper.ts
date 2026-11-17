import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import type { Db } from '@/lib/prisma'

// 전용 화주사 검사 (창고 0074·로케이션 0075 → 0080): 그 센터를 이용 중인 화주사만 전용으로 정할 수 있다
// 다른 운영사 화주사는 조회되지 않아 "찾을 수 없음"이 된다 (prisma.ts 운영사 분리)
export async function assertDedicatedShipper(db: Db, shipperId: bigint, centerId: bigint) {
  const shipper = await db.shipper.findUnique({
    where: { id: shipperId },
    select: {
      code: true,
      centers: { where: { centerId, status: 'ACTIVE' }, select: { centerId: true } },
    },
  })
  if (!shipper) throw new ActionError('VALIDATION', '전용 화주사를 찾을 수 없습니다.')
  if (shipper.centers.length === 0) {
    throw new ActionError(
      'VALIDATION',
      `${shipper.code}는 이 센터를 이용하지 않아 전용 화주사로 정할 수 없습니다. 화주사의 이용 센터에 먼저 넣어 주세요.`,
    )
  }
}
