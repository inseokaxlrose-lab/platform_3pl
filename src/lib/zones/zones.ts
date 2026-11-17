import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import type { Db } from '@/lib/prisma'
import { DELETED_ONLY, NOT_DELETED } from '@/lib/status'
import { ZONE_TYPE_GROUP, type ZoneData } from './zone-schema'

// 구역 저장 (docs/decisions/0075) — 창고 수정과 같은 트랜잭션에서 표 전체를 맞춘다
// - 줄 키가 있으면 고치고, 없으면 새로 만들고, 표에서 빠진 구역은 지운다(논리 삭제)
// - 구역코드는 저장 후 바꿀 수 없다 (로케이션 코드 앞자리로 이미 쓰였다)
// - 지우기: 로케이션이 하나도 없을 때만 / 사용 중지: 그 구역 로케이션에 재고가 없을 때만

type Warehouse = { id: bigint; centerId: bigint; operatorId: bigint }

// 재고가 남은 구역 id
async function stockedZoneIds(db: Db, zoneIds: bigint[]) {
  if (zoneIds.length === 0) return new Set<bigint>()
  const rows = await db.stock.findMany({
    where: { qty: { gt: 0 }, location: { zoneId: { in: zoneIds } } },
    select: { location: { select: { zoneId: true } } },
    distinct: ['locationId'],
  })
  return new Set(rows.map((r) => r.location.zoneId!))
}

// 표 저장: 저장한 순서대로 줄 키를 돌려준다 (화면이 새 줄에 키를 채운다)
export async function saveZones(db: Db, warehouse: Warehouse, rows: ZoneData[]) {
  const existing = await db.zone.findMany({
    where: { warehouseId: warehouse.id },
    select: {
      id: true,
      code: true,
      status: true,
      _count: { select: { locations: { where: NOT_DELETED } } },
    },
  })
  const byId = new Map(existing.map((z) => [z.id, z]))
  const keptIds = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])))

  for (const row of rows) {
    if (row.id && !byId.has(row.id)) throw new ActionError('NOT_FOUND', '구역을 찾을 수 없습니다.')
  }
  await assertCodeValues(
    db,
    ZONE_TYPE_GROUP,
    rows.map((r) => r.type),
    { label: '구역 유형' },
  )

  // 지울 구역: 로케이션이 있으면 거부
  const removed = existing.filter((z) => !keptIds.has(z.id))
  const withLocations = removed.filter((z) => z._count.locations > 0)
  if (withLocations.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `로케이션이 있는 구역은 지울 수 없습니다. 사용 중지해 주세요: ${withLocations.map((z) => z.code).join(', ')}`,
    )
  }

  // 사용 중지로 바꾸는 구역: 재고가 있으면 거부
  const deactivating = rows.filter(
    (r) => r.id && r.status === 'INACTIVE' && byId.get(r.id)!.status === 'ACTIVE',
  )
  const stocked = await stockedZoneIds(
    db,
    deactivating.map((r) => r.id!),
  )
  if (stocked.size > 0) {
    const codes = deactivating.filter((r) => stocked.has(r.id!)).map((r) => byId.get(r.id!)!.code)
    throw new ActionError(
      'CONFLICT',
      `재고가 있는 구역은 사용 중지할 수 없습니다: ${codes.join(', ')}`,
    )
  }

  if (removed.length > 0) {
    await db.zone.updateMany({
      where: { id: { in: removed.map((z) => z.id) } },
      data: DELETED_ONLY,
    })
  }

  const ids: bigint[] = []
  for (const row of rows) {
    const fields = {
      name: row.name,
      type: row.type,
      pickSeq: row.pickSeq,
      sortOrder: row.sortOrder,
      status: row.status,
    }
    if (row.id) {
      const current = byId.get(row.id)!
      if (current.code !== row.code) {
        throw new ActionError(
          'VALIDATION',
          `구역코드는 저장 후 바꿀 수 없습니다: ${current.code} (새 코드가 필요하면 구역을 새로 만드세요)`,
        )
      }
      await db.zone.update({ where: { id: row.id }, data: fields })
      ids.push(row.id)
    } else {
      // 지운 구역과 같은 코드는 다시 쓸 수 있다 (고유 인덱스는 삭제 안 된 것끼리만)
      const taken = await db.zone.findFirst({
        where: { warehouseId: warehouse.id, code: row.code },
        select: { id: true },
      })
      if (taken && !removed.some((z) => z.id === taken.id)) {
        throw new ActionError('CONFLICT', `이 창고에 이미 있는 구역코드입니다: ${row.code}`)
      }
      const created = await db.zone.create({
        data: {
          operatorId: warehouse.operatorId,
          centerId: warehouse.centerId,
          warehouseId: warehouse.id,
          code: row.code,
          ...fields,
        },
        select: { id: true },
      })
      ids.push(created.id)
    }
  }
  return ids
}
