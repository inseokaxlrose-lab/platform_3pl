import 'server-only'
import type { Db } from '@/lib/prisma'
import { NOT_DELETED } from '@/lib/status'
import { buildLocationBarcode, splitLocationScan } from './location-barcode'

// 로케이션 스캔 해석 (docs/decisions/0084 ⑤) — 적치·이동·피킹·실사 등 모든 스캔 화면은 이 함수만 쓴다
// - "창고코드.로케이션코드": 그 센터에서 한 곳을 찾는다
// - 로케이션코드만(사람이 직접 입력): 센터 안에서 찾아 1건이면 확정, 2건 이상이면 창고를 고르게 후보를 돌려준다
// 지운 로케이션은 prisma.ts가 빼고, 사용 여부(상태·잠금)는 부르는 쪽이 업무에 맞게 판단한다

export type ScannedLocation = {
  id: bigint
  code: string
  warehouseCode: string
  barcode: string
  status: string
}

export type LocationScanResult =
  | { result: 'FOUND'; location: ScannedLocation }
  | { result: 'AMBIGUOUS'; candidates: ScannedLocation[] }
  | { result: 'NOT_FOUND' }

const SELECT = {
  id: true,
  code: true,
  status: true,
  warehouse: { select: { code: true } },
} as const

export async function parseLocationScan(
  db: Db,
  centerId: bigint,
  scanned: string,
): Promise<LocationScanResult> {
  const parts = splitLocationScan(scanned)
  if (!parts) return { result: 'NOT_FOUND' }
  const rows = await db.location.findMany({
    where: {
      code: parts.locationCode,
      // 관계 조건은 지운 창고를 직접 뺀다 (prisma.ts는 바깥 조회만 거른다)
      warehouse: {
        ...NOT_DELETED,
        centerId,
        ...(parts.warehouseCode !== null && { code: parts.warehouseCode }),
      },
    },
    select: SELECT,
    orderBy: { warehouse: { code: 'asc' } },
  })
  const found = rows.map((r) => ({
    id: r.id,
    code: r.code,
    warehouseCode: r.warehouse.code,
    barcode: buildLocationBarcode(r.warehouse.code, r.code),
    status: r.status,
  }))
  if (found.length === 0) return { result: 'NOT_FOUND' }
  if (found.length === 1) return { result: 'FOUND', location: found[0] }
  return { result: 'AMBIGUOUS', candidates: found }
}
