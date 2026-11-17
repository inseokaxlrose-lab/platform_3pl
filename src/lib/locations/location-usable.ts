import 'server-only'
import { prisma, type Db } from '@/lib/prisma'
import { resolveLocationOps } from '@/lib/settings/effective-setting'
import { isYes } from '@/lib/yn'

// 로케이션을 지금 이 용도로 쓸 수 있는지 (docs/decisions/0075)
// 로케이션이 사용 중이어도 위 단계(센터·창고·구역)가 멈췄거나, 잠겼거나, 운영 속성이 막으면 쓸 수 없다
//   PUTAWAY 적치(입고 가능) / PICK 피킹(출고 가능) / ALLOCATE 출고 할당(할당 가능)
// 입고·출고·재고 이동 기능은 로케이션을 고를 때 이 함수로 확인한다

export type LocationPurpose = 'PUTAWAY' | 'PICK' | 'ALLOCATE'

const PURPOSE_OP = { PUTAWAY: 'inbound', PICK: 'outbound', ALLOCATE: 'allocatable' } as const
const PURPOSE_LABEL = { PUTAWAY: '적치', PICK: '피킹', ALLOCATE: '출고 할당' } as const

type OpsRow = { inboundYn: string | null; outboundYn: string | null; allocatableYn: string | null }
export type UsableRow = OpsRow & {
  status: string
  delYn: string
  lockYn: string
  center: { status: string }
  warehouse: OpsRow & { status: string; delYn: string }
  zone: { status: string; delYn: string } | null
}

// 순수 함수: 쓸 수 없는 이유 (쓸 수 있으면 null)
export function unusableReason(row: UsableRow, purpose: LocationPurpose): string | null {
  if (isYes(row.delYn)) return '삭제된 로케이션입니다.'
  if (row.center.status !== 'ACTIVE') return '운영중인 센터가 아닙니다.'
  if (isYes(row.warehouse.delYn) || row.warehouse.status !== 'ACTIVE')
    return '사용 중지된 창고입니다.'
  if (row.zone && (isYes(row.zone.delYn) || row.zone.status !== 'ACTIVE'))
    return '사용 중지된 구역입니다.'
  if (row.status !== 'ACTIVE') return '사용 중지된 로케이션입니다.'
  if (isYes(row.lockYn)) return '잠긴 로케이션입니다 (실사·점검 중).'
  const ops = resolveLocationOps(row, row.warehouse)
  if (!ops[PURPOSE_OP[purpose]].value) return `${PURPOSE_LABEL[purpose]}할 수 없는 로케이션입니다.`
  return null
}

const OPS = { inboundYn: true, outboundYn: true, allocatableYn: true } as const

// 로케이션 한 칸 확인
export async function isLocationUsable(
  locationId: bigint,
  purpose: LocationPurpose,
  db: Db = prisma,
): Promise<{ usable: boolean; reason: string | null }> {
  const row = await db.location.findFirst({
    // 지운 로케이션도 찾아서 이유를 알려 준다
    where: { id: locationId, delYn: { in: ['Y', 'N'] } },
    select: {
      ...OPS,
      status: true,
      delYn: true,
      lockYn: true,
      center: { select: { status: true } },
      warehouse: { select: { ...OPS, status: true, delYn: true } },
      zone: { select: { status: true, delYn: true } },
    },
  })
  if (!row) return { usable: false, reason: '로케이션을 찾을 수 없습니다.' }
  const reason = unusableReason(row, purpose)
  return { usable: reason === null, reason }
}
