import 'server-only'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { prisma, type Db } from '@/lib/prisma'
import { DELETED_ONLY, isActiveStatus, NOT_DELETED, toStatus } from '@/lib/status'
import { isYes, toYn } from '@/lib/yn'
import { isSystemWarehouse } from '@/lib/warehouses/warehouse-codes'
import {
  expandLocationPattern,
  type GeneratedLocation,
  type LocationPattern,
} from './location-pattern'
import type { LocationBulkData, LocationData } from './location-schema'

// 로케이션 저장 (docs/decisions/0028, 0075). 권한·데이터 범위 검사는 서버 액션에서 한다
// - 코드·창고는 등록 후 바꿀 수 없다 (라벨이 붙어 있고 재고·적치 기록이 이 주소를 가리킨다)
// - 코드는 같은 창고 안에서 중복 금지 (사용자 결정, 0075)
// - 시스템 기본 창고에는 추가할 수 없고, 시스템 기본 로케이션(DEFAULT)은 사용 중지·삭제할 수 없다
// - 사용 중지는 재고가 없을 때만, 삭제는 재고 기록이 하나도 없을 때만

export type TargetWarehouse = { id: bigint; centerId: bigint; systemYn: string; status: string }

// 로케이션을 추가할 수 있는 창고인지
function assertCanAddTo(warehouse: TargetWarehouse) {
  if (isSystemWarehouse(warehouse)) {
    throw new ActionError(
      'CONFLICT',
      '시스템 기본 창고(입고·출고·반품 대기)에는 로케이션을 추가할 수 없습니다. (기본 로케이션 하나만 씁니다)',
    )
  }
  if (!isActiveStatus(warehouse.status)) {
    throw new ActionError('CONFLICT', '사용 중지된 창고에는 로케이션을 추가할 수 없습니다.')
  }
}

// 구역: 같은 창고의 구역만 (새로 붙일 때는 사용 중인 구역만)
async function resolveZone(
  db: Db,
  warehouseId: bigint,
  zoneId: bigint | null,
  keepId?: bigint | null,
) {
  if (!zoneId) return null
  const zone = await db.zone.findUnique({
    where: { id: zoneId },
    select: { id: true, code: true, warehouseId: true, status: true },
  })
  if (!zone || zone.warehouseId !== warehouseId) {
    throw new ActionError('VALIDATION', '같은 창고의 구역만 고를 수 있습니다.')
  }
  if (zone.id !== keepId && !isActiveStatus(zone.status)) {
    throw new ActionError('VALIDATION', '사용 중지된 구역에는 로케이션을 넣을 수 없습니다.')
  }
  return zone
}

// 공통코드 값 확인 (유형·잠금 사유·회전 등급)
async function assertLocationCodes(
  db: Db,
  data: { locType: string; lockReason?: string | null; abcClass?: string | null },
) {
  await assertCodeValues(db, 'LOC_TYPE', [data.locType], { label: '로케이션 유형' })
  if (data.lockReason) {
    await assertCodeValues(db, 'LOCK_REASON', [data.lockReason], { label: '잠금 사유' })
  }
  if (data.abcClass)
    await assertCodeValues(db, 'ABC_CLASS', [data.abcClass], { label: '회전 등급' })
}

// 상속 칸(예/아니오/창고 값): null은 그대로 null
const ynOrNull = (value: boolean | null) => (value === null ? null : toYn(value))

// 용량·운영 속성 (일괄 생성 공통 속성과 같은 모양)
function attributeFields(data: LocationBulkData['attributes']) {
  return {
    locType: data.locType,
    widthCm: data.widthCm,
    depthCm: data.depthCm,
    heightCm: data.heightCm,
    maxCbm: data.maxCbm,
    maxWeightKg: data.maxWeightKg,
    maxPalletCnt: data.maxPalletCnt,
    inboundYn: ynOrNull(data.inbound),
    outboundYn: ynOrNull(data.outbound),
    allocatableYn: ynOrNull(data.allocatable),
    mixItemYn: toYn(data.mixItem),
    mixLotYn: toYn(data.mixLot),
    mixClientYn: toYn(data.mixClient),
  }
}

// DB 칸 값 (1차 + 보낸 2차만)
function locationFields(data: LocationData) {
  return {
    description: data.description,
    remark: data.remark,
    rowNo: data.rowNo,
    levelNo: data.levelNo,
    putawaySeq: data.putawaySeq,
    pickSeq: data.pickSeq,
    ...attributeFields(data),
    ...(data.bayNo !== undefined && { bayNo: data.bayNo }),
    ...(data.cellNo !== undefined && { cellNo: data.cellNo }),
    ...(data.posX !== undefined && { posX: data.posX }),
    ...(data.posY !== undefined && { posY: data.posY }),
    ...(data.abcClass !== undefined && { abcClass: data.abcClass }),
    ...(data.dedicatedShipperId !== undefined && { dedicatedShipperId: data.dedicatedShipperId }),
    ...(data.lock !== undefined && {
      lockYn: toYn(data.lock),
      lockReason: data.lock ? (data.lockReason ?? null) : null,
    }),
  }
}

// 재고가 새 규칙(유형·다화주 혼적)을 어기는지 — 재고·적치 기능이 생기면 검사를 채운다 (지금은 자리만, 0075)
async function assertStockFitsRules(
  _db: Db,
  _locationId: bigint,
  _next: { locType: string; mixClient: boolean },
) {
  void _db
  void _locationId
  void _next
}

// 한 칸 등록
export async function createLocation(warehouse: TargetWarehouse, code: string, data: LocationData) {
  assertCanAddTo(warehouse)
  return prisma.$transaction(async (tx) => {
    const exists = await tx.location.findUnique({
      where: { warehouseId_code: { warehouseId: warehouse.id, code } },
      select: { id: true },
    })
    if (exists) throw new ActionError('CONFLICT', `이 창고에 이미 있는 로케이션입니다: ${code}`)
    const zone = await resolveZone(tx, warehouse.id, data.zoneId)
    await assertLocationCodes(tx, data)
    const location = await tx.location.create({
      data: {
        operatorId: requireOperatorId(),
        centerId: warehouse.centerId,
        warehouseId: warehouse.id,
        zoneId: zone?.id ?? null,
        code,
        ...locationFields(data),
        ...(data.lock && { lockAt: new Date() }),
      },
      select: { id: true, code: true, rowVersion: true },
    })
    return location
  })
}

// 수정: 코드·창고는 바뀌지 않는다. 시스템 기본 로케이션은 설명·비고만
export async function updateLocation(id: bigint, rowVersion: number, data: LocationData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.location.findUnique({
      where: { id },
      select: {
        warehouseId: true,
        zoneId: true,
        code: true,
        systemYn: true,
        lockYn: true,
        rowVersion: true,
      },
    })
    assertRowVersion(found, rowVersion, '로케이션을 찾을 수 없습니다.')
    const current = found!

    let fields: Record<string, unknown>
    if (isYes(current.systemYn)) {
      fields = { description: data.description, remark: data.remark }
    } else {
      const zone = await resolveZone(tx, current.warehouseId, data.zoneId, current.zoneId)
      await assertLocationCodes(tx, data)
      await assertStockFitsRules(tx, id, { locType: data.locType, mixClient: data.mixClient })
      fields = {
        ...locationFields(data),
        zoneId: zone?.id ?? null,
        // 새로 잠글 때만 잠금 일시를 남긴다
        ...(data.lock !== undefined && {
          lockAt: data.lock ? (isYes(current.lockYn) ? undefined : new Date()) : null,
        }),
      }
    }
    const saved = await withVersionGuard(() =>
      tx.location.update({
        where: { id, rowVersion },
        data: fields,
        select: { id: true, code: true, rowVersion: true },
      }),
    )
    return saved
  })
}

// ── 일괄 생성 ──────────────────────────────────────────────────

// 구역 확인 + 패턴의 {ZONE}을 그 구역 코드로
async function resolveBulk(db: Db, warehouse: TargetWarehouse, input: LocationBulkData) {
  assertCanAddTo(warehouse)
  const zone = await resolveZone(db, warehouse.id, input.zoneId)
  return { zone: zone!, pattern: { ...input.pattern, zoneCode: zone!.code } as LocationPattern }
}

// 범위의 코드 중 이미 있는 것은 건너뛴다
async function planBulk(db: Db, warehouseId: bigint, pattern: LocationPattern) {
  const all = expandLocationPattern(pattern)
  const existing = await db.location.findMany({
    where: { warehouseId, code: { in: all.map((l) => l.code) } },
    select: { code: true },
  })
  const existingCodes = new Set(existing.map((l) => l.code))
  const toCreate = all.filter((l) => !existingCodes.has(l.code))
  return { total: all.length, skipped: all.length - toCreate.length, toCreate }
}

// 미리보기용 요약: 처음 5개와 마지막 5개
function sample(list: GeneratedLocation[]) {
  const codes = list.map((l) => l.code)
  return codes.length <= 10
    ? { first: codes, last: [] }
    : { first: codes.slice(0, 5), last: codes.slice(-5) }
}

// 일괄 생성 미리보기 (실제로 만들지 않음): 만들 개수·이미 있어 건너뛸 개수·처음과 마지막 코드
export async function previewBulkLocations(warehouse: TargetWarehouse, input: LocationBulkData) {
  const { pattern } = await resolveBulk(prisma, warehouse, input)
  const plan = await planBulk(prisma, warehouse.id, pattern)
  return {
    total: plan.total,
    skipped: plan.skipped,
    toCreate: plan.toCreate.length,
    ...sample(plan.toCreate),
  }
}

// 일괄 생성: 없는 코드만, 한 트랜잭션으로 (최대 5,000개라 한 번에 넣어도 빠르고, 실패하면 전부 취소)
export async function bulkCreateLocations(warehouse: TargetWarehouse, input: LocationBulkData) {
  return prisma.$transaction(async (tx) => {
    const { zone, pattern } = await resolveBulk(tx, warehouse, input)
    await assertLocationCodes(tx, input.attributes)
    const plan = await planBulk(tx, warehouse.id, pattern)
    const operatorId = requireOperatorId()
    const attributes = attributeFields(input.attributes)
    const { count } = await tx.location.createMany({
      data: plan.toCreate.map((l) => ({
        operatorId,
        centerId: warehouse.centerId,
        warehouseId: warehouse.id,
        zoneId: zone.id,
        ...l,
        ...attributes,
      })),
      // 미리 거른 뒤에도 동시에 누가 만들었을 수 있어 한 번 더 건너뛴다
      skipDuplicates: true,
    })
    return { created: count, skipped: plan.total - count, zoneId: zone.id }
  })
}

// ── 사용 중지·삭제·되살리기 ──────────────────────────────────────

type LocationRef = { id: bigint; code: string; systemYn: string }

const codesText = (codes: string[]) =>
  `${codes.slice(0, 5).join(', ')}${codes.length > 5 ? ` 외 ${codes.length - 5}개` : ''}`

function assertNoneSystem(locations: LocationRef[], what: string) {
  const system = locations.filter((l) => isYes(l.systemYn))
  if (system.length > 0) {
    throw new ActionError('CONFLICT', `시스템 기본 로케이션(DEFAULT)은 ${what}할 수 없습니다.`)
  }
}

// 쓰인 적 있는 로케이션 id (재고 줄이 있음 = 재고 이력이 있음, 수량이 0이어도 기록은 남는다)
// 재고 줄은 재고 변경 공통 함수가 이력과 함께 만들고 지우지 않는다 (docs/decisions/0045)
export async function findUsedLocationIds(ids: bigint[], { stockedOnly = false } = {}) {
  if (ids.length === 0) return []
  const rows = await prisma.stock.findMany({
    where: { locationId: { in: ids }, ...(stockedOnly && { qty: { gt: 0 } }) },
    distinct: ['locationId'],
    select: { locationId: true },
  })
  return rows.map((r) => r.locationId)
}

export async function setLocationsActive(locations: LocationRef[], isActive: boolean) {
  if (!isActive) {
    assertNoneSystem(locations, '사용 중지')
    const stocked = new Set(
      await findUsedLocationIds(
        locations.map((l) => l.id),
        { stockedOnly: true },
      ),
    )
    if (stocked.size > 0) {
      const codes = locations.filter((l) => stocked.has(l.id)).map((l) => l.code)
      throw new ActionError(
        'CONFLICT',
        `재고가 남아 있는 로케이션은 사용 중지할 수 없습니다. 재고를 옮긴 뒤 다시 시도해 주세요: ${codesText(codes)}`,
      )
    }
  }
  const { count } = await prisma.location.updateMany({
    where: { id: { in: locations.map((l) => l.id) } },
    data: { status: toStatus(isActive) },
  })
  return { updated: count }
}

export async function deleteLocations(locations: LocationRef[]) {
  assertNoneSystem(locations, '삭제')
  const ids = locations.map((l) => l.id)
  const used = new Set(await findUsedLocationIds(ids))
  if (used.size > 0) {
    const codes = locations.filter((l) => used.has(l.id)).map((l) => l.code)
    throw new ActionError(
      'CONFLICT',
      `재고 기록이 있는 로케이션은 삭제할 수 없습니다. 사용 중지해 주세요: ${codesText(codes)}`,
    )
  }
  const [, result] = await prisma.$transaction([
    prisma.externalCode.deleteMany({ where: { entityType: 'LOCATION', entityId: { in: ids } } }),
    // 논리 삭제 (되살릴 수 있다). 외부 코드는 지운다
    prisma.location.updateMany({ where: { id: { in: ids } }, data: DELETED_ONLY }),
  ])
  return { deleted: result.count }
}

// 되살리기: 지운 로케이션을 다시 목록에 (같은 창고에 같은 코드가 이미 다시 생겼으면 거부)
export async function restoreLocations(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.location.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { id: true, warehouseId: true, code: true },
    })
    assertAllFound(rows.length, ids.length, '로케이션')
    const taken = await tx.location.findMany({
      where: { OR: rows.map((r) => ({ warehouseId: r.warehouseId, code: r.code })) },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '로케이션 코드',
    )
    const { count } = await tx.location.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
