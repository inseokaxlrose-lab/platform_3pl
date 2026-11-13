import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { DEFAULT_LOCATION_CODE } from '@/lib/centers/center-defaults'
import { prisma } from '@/lib/prisma'
import { expandLocationRange, type GeneratedLocation, type LocationRange } from './location-range'

// 로케이션 저장 (docs/decisions/0028). 권한·데이터 범위 검사는 서버 액션에서 한다
// - 코드는 등록 후 바꿀 수 없다 (재고·적치 기록이 이 주소를 가리킨다)
// - 입고대기 창고에는 추가할 수 없고(기본 로케이션 DEFAULT 하나만), DEFAULT는 사용 중지·삭제할 수 없다
// - 삭제는 한 번도 쓰이지 않은 로케이션만

export type TargetWarehouse = { id: string; centerId: string; type: string; isActive: boolean }

// 로케이션을 추가할 수 있는 창고인지
function assertCanAddTo(warehouse: TargetWarehouse) {
  if (warehouse.type === 'INBOUND_STAGING') {
    throw new ActionError(
      'CONFLICT',
      '입고대기 창고에는 로케이션을 추가할 수 없습니다. (기본 로케이션 하나만 씁니다)',
    )
  }
  if (!warehouse.isActive) {
    throw new ActionError('CONFLICT', '사용 중지된 창고에는 로케이션을 추가할 수 없습니다.')
  }
}

// 한 칸 등록
export async function createLocation(warehouse: TargetWarehouse, code: string) {
  assertCanAddTo(warehouse)
  const exists = await prisma.location.findUnique({
    where: { warehouseId_code: { warehouseId: warehouse.id, code } },
    select: { id: true },
  })
  if (exists) throw new ActionError('CONFLICT', `이 창고에 이미 있는 로케이션입니다: ${code}`)
  return prisma.location.create({
    data: { warehouseId: warehouse.id, code },
    select: { id: true, code: true },
  })
}

// 일괄 생성 계산: 범위의 코드 중 이미 있는 것은 건너뛴다
async function planBulk(warehouseId: string, range: LocationRange) {
  const all = expandLocationRange(range)
  const existing = await prisma.location.findMany({
    where: { warehouseId, code: { in: all.map((l) => l.code) } },
    select: { code: true },
  })
  const existingCodes = new Set(existing.map((l) => l.code))
  const toCreate = all.filter((l) => !existingCodes.has(l.code))
  return { total: all.length, skipped: all.length - toCreate.length, toCreate }
}

// 미리보기용 요약: 처음 몇 개와 마지막 몇 개만
function sample(list: GeneratedLocation[]) {
  const codes = list.map((l) => l.code)
  return codes.length <= 8
    ? { first: codes, last: [] }
    : { first: codes.slice(0, 5), last: codes.slice(-3) }
}

// 일괄 생성 미리보기 (실제로 만들지 않음)
export async function previewBulkLocations(warehouse: TargetWarehouse, range: LocationRange) {
  assertCanAddTo(warehouse)
  const plan = await planBulk(warehouse.id, range)
  return {
    total: plan.total,
    skipped: plan.skipped,
    toCreate: plan.toCreate.length,
    ...sample(plan.toCreate),
  }
}

// 일괄 생성: 없는 코드만 만든다 (같은 범위를 다시 실행해도 안전)
export async function bulkCreateLocations(warehouse: TargetWarehouse, range: LocationRange) {
  assertCanAddTo(warehouse)
  const plan = await planBulk(warehouse.id, range)
  const { count } = await prisma.location.createMany({
    data: plan.toCreate.map((l) => ({ warehouseId: warehouse.id, ...l })),
    // 미리 거른 뒤에도 동시에 누가 만들었을 수 있어 한 번 더 건너뛴다
    skipDuplicates: true,
  })
  return { created: count, skipped: plan.total - count }
}

// 입고대기 창고의 기본 로케이션인지 (보호 대상)
type LocationWithWarehouse = { code: string; warehouse: { type: string } }
const isProtected = (l: LocationWithWarehouse) =>
  l.warehouse.type === 'INBOUND_STAGING' && l.code === DEFAULT_LOCATION_CODE

function assertNoneProtected(locations: LocationWithWarehouse[], what: string) {
  if (locations.some(isProtected)) {
    throw new ActionError('CONFLICT', `입고대기 창고의 기본 로케이션은 ${what}할 수 없습니다.`)
  }
}

// 쓰인 적 있는 로케이션 id (재고·이력이 있음)
// TODO(재고 작업, ROADMAP M5): 재고·재고 이력 표가 생기면 여기서 검사한다. 지금은 쓰일 곳이 없어 빈 목록
export async function findUsedLocationIds(ids: string[]): Promise<string[]> {
  void ids // 재고 표가 생기면 이 id들로 검사한다
  return []
}

export async function setLocationsActive(
  locations: (LocationWithWarehouse & { id: string })[],
  isActive: boolean,
) {
  if (!isActive) assertNoneProtected(locations, '사용 중지')
  const { count } = await prisma.location.updateMany({
    where: { id: { in: locations.map((l) => l.id) } },
    data: { isActive },
  })
  return { updated: count }
}

export async function deleteLocations(locations: (LocationWithWarehouse & { id: string })[]) {
  assertNoneProtected(locations, '삭제')
  const ids = locations.map((l) => l.id)
  const used = new Set(await findUsedLocationIds(ids))
  if (used.size > 0) {
    const codes = locations.filter((l) => used.has(l.id)).map((l) => l.code)
    throw new ActionError(
      'CONFLICT',
      `재고 기록이 있는 로케이션은 삭제할 수 없습니다. 사용 중지해 주세요: ${codes.slice(0, 5).join(', ')}${codes.length > 5 ? ` 외 ${codes.length - 5}개` : ''}`,
    )
  }
  const [, result] = await prisma.$transaction([
    prisma.externalCode.deleteMany({ where: { entityType: 'LOCATION', entityId: { in: ids } } }),
    prisma.location.deleteMany({ where: { id: { in: ids } } }),
  ])
  return { deleted: result.count }
}
