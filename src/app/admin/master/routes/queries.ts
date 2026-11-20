import 'server-only'
import { CARRIER_STATUS } from '@/lib/carriers/carrier-codes'
import { carrierOptions } from '@/lib/carriers/carriers'
import { toValue } from '@/lib/db-value'
import { dateToTime } from '@/lib/format/time'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import type { RouteCreateInput } from '@/lib/routes/route-schema'
import { listRouteZips } from '@/lib/routes/route-zips'
import { isInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'

// 배송 코스 화면 조회 (docs/decisions/0095) — 센터 직원은 소속 센터 코스만

// 고르기 선택지: 범위 안 센터 + 운송사 (사용 중 + 지금 코스의 운송사)
export async function getRouteOptions(scope: DataScope, keepCarrierIds: bigint[] = []) {
  if (scope.operatorId === undefined) return { centers: [], carriers: [] }
  const [centers, carriers] = await Promise.all([
    prisma.center.findMany({
      where: scopeFilter(scope, { center: 'id' }),
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true },
    }),
    carrierOptions(prisma, scope.operatorId, keepCarrierIds),
  ])
  return textIds({ centers, carriers })
}

export type RouteOptions = Awaited<ReturnType<typeof getRouteOptions>>

// 수정 화면 한 건 + 배정 우편번호 (범위 밖이면 null)
export async function getRouteForEdit(id: bigint, scope: DataScope) {
  const row = await prisma.route.findUnique({
    where: { id },
    select: {
      id: true,
      operatorId: true,
      centerId: true,
      code: true,
      custCode: true,
      name: true,
      carrierId: true,
      runDays: true,
      cutoffTime: true,
      vehicleTon: true,
      destHub: true,
      status: true,
      sortOrder: true,
      remark: true,
      rowVersion: true,
      center: { select: { name: true } },
      _count: { select: { shipTos: { where: { delYn: 'N' } } } },
    },
  })
  if (!row || !isInScope(scope, row, { center: 'centerId' })) return null
  const zips = await listRouteZips(prisma, row)
  const input: RouteCreateInput = {
    centerId: String(row.centerId),
    code: row.code,
    custCode: row.custCode ?? '',
    name: row.name,
    carrierId: row.carrierId === null ? '' : String(row.carrierId),
    runDays: row.runDays,
    cutoffTime: dateToTime(row.cutoffTime),
    vehicleTon: row.vehicleTon ?? '',
    destHub: row.destHub ?? '',
    status: toValue(CARRIER_STATUS.values, row.status),
    sortOrder: row.sortOrder,
    remark: row.remark ?? '',
  }
  return {
    id: String(row.id),
    rowVersion: row.rowVersion,
    carrierId: row.carrierId,
    centerName: row.center.name,
    manualShipToCount: row._count.shipTos,
    zips,
    input,
  }
}

export type RouteForEdit = NonNullable<Awaited<ReturnType<typeof getRouteForEdit>>>
