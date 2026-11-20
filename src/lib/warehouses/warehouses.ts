import 'server-only'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { prisma, type Db } from '@/lib/prisma'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, toStatus } from '@/lib/status'
import { isYes, toYn } from '@/lib/yn'
import { saveZones } from '@/lib/zones/zones'
import type { WarehouseCreateData, WarehouseData } from './warehouse-schema'
import { assertDedicatedShipper } from '@/lib/shippers/dedicated-shipper'

// 창고 저장 (docs/decisions/0027, 0074). 권한·데이터 범위·센터 상태 검사는 서버 액션에서 한다
// - 창고코드·센터는 등록 후 바꿀 수 없다
// - 시스템 기본 창고(입고·출고·반품 대기): 설명·정렬순서·비고만 고친다. 삭제·사용 중지 불가
// - 재고가 있으면 유형·온도대 변경과 사용 중지를 막는다 (재고상태·할당 대상·보관 조건이 바뀌므로)
// - 삭제는 로케이션·재고 기록이 하나도 없을 때만 (그 밖에는 사용 중지)

type Center = { id: bigint; bondedYn: string; hazmatYn: string; tempZones: string[] }

async function loadCenter(db: Db, centerId: bigint): Promise<Center> {
  const center = await db.center.findUniqueOrThrow({
    where: { id: centerId },
    select: {
      id: true,
      bondedYn: true,
      hazmatYn: true,
      tempZones: { select: { tempZoneCd: true } },
    },
  })
  return { ...center, tempZones: center.tempZones.map((z) => z.tempZoneCd) }
}

// 창고코드: 같은 센터 안 중복 금지 (필수 입력 — 시스템 코드는 0084에서 없앰)
async function assertWarehouseCode(db: Db, centerId: bigint, code: string) {
  const owner = await db.warehouse.findUnique({
    where: { centerId_code: { centerId, code } },
    select: { id: true },
  })
  if (owner) {
    throw new ActionError('CONFLICT', `이 센터에 이미 있는 창고코드입니다: ${code}`)
  }
}

// 센터와 맞는지: 온도대는 센터 취급 온도대 안, 보세·위험물은 센터 자격이 있을 때만
function assertFitsCenter(
  center: Center,
  data: { tempZone: string; bondedYn?: boolean; hazmatYn?: boolean },
) {
  if (!center.tempZones.includes(data.tempZone)) {
    const allowed = center.tempZones.map((z) => TEMP_ZONE.labels[z as TempZoneKey]).join(', ')
    throw new ActionError(
      'VALIDATION',
      `센터가 취급하지 않는 온도대입니다. 센터 취급 온도대 중에서 골라 주세요: ${allowed || '(없음)'}`,
    )
  }
  if (data.bondedYn && !isYes(center.bondedYn)) {
    throw new ActionError('VALIDATION', '보세 센터가 아니라 보세 구역으로 정할 수 없습니다.')
  }
  if (data.hazmatYn && !isYes(center.hazmatYn)) {
    throw new ActionError(
      'VALIDATION',
      '위험물 취급 센터가 아니라 위험물 구역으로 정할 수 없습니다.',
    )
  }
}

// 2차 참조 값: 담당자·전용 화주사는 같은 운영사 것만, 전용 화주사는 이 센터를 이용하는 화주만 (다른 운영사 것은 조회되지 않는다), 보관 방식은 공통코드
async function assertReferences(db: Db, data: WarehouseCreateData, centerId: bigint) {
  if (data.managerUserId) {
    const user = await db.user.findUnique({
      where: { id: data.managerUserId },
      select: { id: true },
    })
    if (!user) throw new ActionError('VALIDATION', '관리 담당자를 찾을 수 없습니다.')
  }
  // 전용 화주사: 이 센터를 이용 중인 화주사만 (0080)
  if (data.dedicatedShipperId) await assertDedicatedShipper(db, data.dedicatedShipperId, centerId)
  if (data.storageMethod) {
    await assertCodeValues(db, 'STORAGE_METHOD', [data.storageMethod], { label: '보관 방식' })
  }
}

// 기본 로케이션: 이 창고의 사용 중인 로케이션만
async function assertDefaultLocation(db: Db, warehouseId: bigint, locationId: bigint | null) {
  if (!locationId) return
  const location = await db.location.findUnique({
    where: { id: locationId },
    select: { warehouseId: true, status: true },
  })
  if (!location || location.warehouseId !== warehouseId || location.status !== 'ACTIVE') {
    throw new ActionError(
      'VALIDATION',
      '기본 로케이션은 이 창고의 사용 중인 로케이션만 고를 수 있습니다.',
    )
  }
}

// 재고가 남아 있는 창고 id (수량 > 0)
export async function findStockedWarehouseIds(db: Db, ids: bigint[]) {
  if (ids.length === 0) return []
  const rows = await db.stock.findMany({
    where: { warehouseId: { in: ids }, qty: { gt: 0 } },
    distinct: ['warehouseId'],
    select: { warehouseId: true },
  })
  return rows.map((r) => r.warehouseId)
}

// DB 칸 값 (1차 + 보낸 2차만)
function warehouseFields(data: WarehouseCreateData) {
  return {
    name: data.name,
    custCode: data.custCode,
    type: data.type,
    tempZone: data.tempZone,
    description: data.description,
    sortOrder: data.sortOrder,
    remark: data.remark,
    buildingName: data.buildingName,
    floorNo: data.floorNo,
    areaM2: data.areaM2,
    inboundYn: toYn(data.inbound),
    outboundYn: toYn(data.outbound),
    allocatableYn: toYn(data.allocatable),
    defaultStockStatus: data.defaultStockStatus,
    allocPriority: data.allocPriority,
    // 2차: 보낸 것만
    ...(data.ceilingHeightM !== undefined && { ceilingHeightM: data.ceilingHeightM }),
    ...(data.palletCapacity !== undefined && { palletCapacity: data.palletCapacity }),
    ...(data.storageMethod !== undefined && { storageMethod: data.storageMethod }),
    ...(data.bondedYn !== undefined && { bondedYn: toYn(data.bondedYn) }),
    ...(data.hazmatYn !== undefined && { hazmatYn: toYn(data.hazmatYn) }),
    ...(data.managerUserId !== undefined && { managerUserId: data.managerUserId }),
    ...(data.dedicatedShipperId !== undefined && { dedicatedShipperId: data.dedicatedShipperId }),
    ...(data.locCodePrefix !== undefined && { locCodePrefix: data.locCodePrefix }),
    ...(data.locCodeSeparator !== undefined && { locCodeSeparator: data.locCodeSeparator }),
  }
}

// 센터에 출고 할당 가능한 사용 중 창고가 없으면 안내 (막지는 않는다)
async function allocatableNotice(db: Db, centerId: bigint) {
  const count = await db.warehouse.count({
    where: { centerId, allocatableYn: 'Y', status: 'ACTIVE' },
  })
  return count === 0
    ? '이 센터에 출고 할당 가능한 창고가 없습니다. 출고하려면 한 곳 이상을 "출고 할당 가능"으로 두세요.'
    : null
}

// 사용자 정의 코드: 센터 안에서 겹치지 않게 (지운 창고 제외, 0093)
async function assertWarehouseCustCode(
  db: Db,
  centerId: bigint,
  custCode: string | null,
  exceptId?: bigint,
) {
  if (!custCode) return
  const owner = await db.warehouse.findFirst({
    where: { centerId, custCode },
    select: { id: true, code: true },
  })
  if (owner && owner.id !== exceptId) {
    throw new ActionError(
      'CONFLICT',
      `이 센터의 다른 창고(${owner.code})가 쓰는 사용자 정의 코드입니다: ${custCode}`,
    )
  }
}

// 등록. 사용자가 만드는 창고는 시스템 기본 창고가 아니다
export async function createWarehouse(centerId: bigint, code: string, data: WarehouseCreateData) {
  return prisma.$transaction(async (tx) => {
    const center = await loadCenter(tx, centerId)
    await assertWarehouseCode(tx, centerId, code)
    await assertWarehouseCustCode(tx, centerId, data.custCode)
    assertFitsCenter(center, data)
    await assertReferences(tx, data, centerId)
    const warehouse = await tx.warehouse.create({
      data: {
        operatorId: requireOperatorId(),
        centerId,
        code,
        ...warehouseFields(data),
      },
      select: { id: true, code: true, rowVersion: true },
    })
    return { ...warehouse, zoneIds: undefined, notice: await allocatableNotice(tx, centerId) }
  })
}

// 수정: 센터·코드는 바뀌지 않는다
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateWarehouse(id: bigint, rowVersion: number, data: WarehouseData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.warehouse.findUnique({
      where: { id },
      select: {
        operatorId: true,
        centerId: true,
        code: true,
        type: true,
        tempZone: true,
        systemYn: true,
        rowVersion: true,
      },
    })
    assertRowVersion(found, rowVersion, '창고를 찾을 수 없습니다.')
    const current = found!
    await assertWarehouseCustCode(tx, current.centerId, data.custCode, id)

    // 시스템 기본 창고: 설명·정렬순서·비고만
    const fields = isYes(current.systemYn)
      ? {
          description: data.description,
          sortOrder: data.sortOrder,
          remark: data.remark,
          custCode: data.custCode,
        }
      : await (async () => {
          const center = await loadCenter(tx, current.centerId)
          assertFitsCenter(center, data)
          await assertReferences(tx, data, current.centerId)
          await assertDefaultLocation(tx, id, data.defaultLocId)
          const changes = [
            data.type !== current.type && '창고 유형',
            data.tempZone !== current.tempZone && '온도대',
          ].filter(Boolean)
          if (changes.length > 0 && (await findStockedWarehouseIds(tx, [id])).length > 0) {
            throw new ActionError(
              'CONFLICT',
              `재고가 있는 창고는 ${changes.join('·')}을(를) 바꿀 수 없습니다. 재고를 옮긴 뒤 바꿔 주세요.`,
            )
          }
          return { ...warehouseFields(data), defaultLocId: data.defaultLocId }
        })()

    const saved = await withVersionGuard(() =>
      tx.warehouse.update({
        where: { id, rowVersion },
        data: fields,
        select: { rowVersion: true },
      }),
    )
    // 구역 표 (시스템 기본 창고는 구역을 쓰지 않는다)
    const zoneIds =
      data.zones && !isYes(current.systemYn)
        ? await saveZones(
            tx,
            { id, centerId: current.centerId, operatorId: current.operatorId },
            data.zones,
          )
        : undefined
    return {
      id,
      code: current.code,
      rowVersion: saved.rowVersion,
      zoneIds,
      notice: await allocatableNotice(tx, current.centerId),
    }
  })
}

type WarehouseRef = { id: bigint; code: string; systemYn: string }

// 사용 중지 / 다시 사용 (여러 개). 시스템 기본 창고·재고 있는 창고는 사용 중지 불가
// 하위 로케이션 상태는 그대로 둔다 (창고가 사용 중지면 입출고 대상에서 빠진다)
export async function setWarehousesActive(warehouses: WarehouseRef[], isActive: boolean) {
  if (!isActive) {
    const system = warehouses.filter((w) => isYes(w.systemYn))
    if (system.length > 0) {
      throw new ActionError(
        'CONFLICT',
        `시스템 기본 창고(입고·출고·반품 대기)는 사용 중지할 수 없습니다: ${system.map((w) => w.code).join(', ')}`,
      )
    }
    const stocked = new Set(
      await findStockedWarehouseIds(
        prisma,
        warehouses.map((w) => w.id),
      ),
    )
    if (stocked.size > 0) {
      const codes = warehouses.filter((w) => stocked.has(w.id)).map((w) => w.code)
      throw new ActionError(
        'CONFLICT',
        `재고가 남아 있는 창고는 사용 중지할 수 없습니다. 재고를 옮긴 뒤 다시 시도해 주세요: ${codes.join(', ')}`,
      )
    }
  }
  const { count } = await prisma.warehouse.updateMany({
    where: { id: { in: warehouses.map((w) => w.id) } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 삭제 (논리 삭제, 되살릴 수 있다): 시스템 기본 창고 불가, 로케이션·재고 기록이 있으면 불가
export async function deleteWarehouses(warehouses: WarehouseRef[]) {
  const system = warehouses.filter((w) => isYes(w.systemYn))
  if (system.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `시스템 기본 창고는 삭제할 수 없습니다: ${system.map((w) => w.code).join(', ')}`,
    )
  }
  const ids = warehouses.map((w) => w.id)
  const [withLocations, withStock] = await Promise.all([
    prisma.location.findMany({
      where: { warehouseId: { in: ids }, ...NOT_DELETED },
      distinct: ['warehouseId'],
      select: { warehouseId: true },
    }),
    prisma.stock.findMany({
      where: { warehouseId: { in: ids } },
      distinct: ['warehouseId'],
      select: { warehouseId: true },
    }),
  ])
  const blocked = new Set([...withLocations, ...withStock].map((r) => r.warehouseId))
  if (blocked.size > 0) {
    const codes = warehouses.filter((w) => blocked.has(w.id)).map((w) => w.code)
    throw new ActionError(
      'CONFLICT',
      `로케이션이나 재고 기록이 있는 창고는 삭제할 수 없습니다. 사용 중지해 주세요: ${codes.join(', ')}`,
    )
  }
  const [, , result] = await prisma.$transaction([
    prisma.externalCode.deleteMany({ where: { entityType: 'WAREHOUSE', entityId: { in: ids } } }),
    // 로케이션이 없는 창고의 구역도 함께 숨긴다 (0075)
    prisma.zone.updateMany({ where: { warehouseId: { in: ids } }, data: DELETED_ONLY }),
    prisma.warehouse.updateMany({ where: { id: { in: ids } }, data: DELETED_ONLY }),
  ])
  return { deleted: result.count }
}

// 되살리기: 같은 센터에 같은 코드가 다시 생겼으면 거부
export async function restoreWarehouses(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.warehouse.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { id: true, centerId: true, code: true },
    })
    assertAllFound(rows.length, ids.length, '창고')
    const taken = await tx.warehouse.findMany({
      where: { OR: rows.map((r) => ({ centerId: r.centerId, code: r.code })) },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '창고코드',
    )
    const { count } = await tx.warehouse.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
