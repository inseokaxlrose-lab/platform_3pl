import 'server-only'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { deleteExternalCodes, saveExternalCodes } from '@/lib/master-code/external-codes'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { prisma } from '@/lib/prisma'
import { isYes } from '@/lib/yn'
import type { UnitCreateData, UnitUpdateData } from './unit-schema'
import { DELETED_ONLY, NOT_DELETED, toStatus, withStatus } from '@/lib/status'

// 단위 저장 (docs/decisions/0034). 권한 검사는 서버 액션에서 한다
// - 코드는 등록 후 바꿀 수 없다
// - 시스템 단위(EA·BOX·PLT): 삭제·사용 중지·종류 변경 불가
// - 삭제는 품목에서 쓰지 않는 단위만 (사용 검사는 품목 작업 때 채운다)

export async function createUnit({ externalCodes, ...data }: UnitCreateData) {
  const operatorId = requireOperatorId()
  if (await prisma.unit.findFirst({ where: { operatorId, code: data.code } })) {
    throw new ActionError('CONFLICT', `이미 있는 단위 코드입니다: ${data.code}`)
  }
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.create({
      data: { ...withStatus(data), operatorId },
      select: { id: true, code: true },
    })
    await saveExternalCodes(tx, 'UNIT', unit.id, externalCodes)
    return unit
  })
}

// rowVersion: 팝업을 열 때의 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateUnit({ id, rowVersion, externalCodes, ...data }: UnitUpdateData) {
  const found = await prisma.unit.findUnique({
    where: { id },
    select: { code: true, kind: true, isSystem: true, rowVersion: true },
  })
  assertRowVersion(found, rowVersion, '단위를 찾을 수 없습니다.')
  const current = found!
  if (isYes(current.isSystem)) {
    if (data.kind !== current.kind) {
      throw new ActionError('VALIDATION', `시스템 단위(${current.code})의 종류는 바꿀 수 없습니다.`)
    }
    if (!data.isActive) {
      throw new ActionError('VALIDATION', `시스템 단위(${current.code})는 사용 중지할 수 없습니다.`)
    }
  }
  return prisma.$transaction(async (tx) => {
    const saved = await withVersionGuard(() =>
      tx.unit.update({
        where: { id, rowVersion },
        data: withStatus(data),
        select: { rowVersion: true },
      }),
    )
    await saveExternalCodes(tx, 'UNIT', id, externalCodes)
    return { id, rowVersion: saved.rowVersion }
  })
}

// 고른 단위 (하나라도 없으면 전체 거부)
async function findUnits(ids: bigint[]) {
  const unique = [...new Set(ids)]
  const units = await prisma.unit.findMany({
    where: { id: { in: unique } },
    select: { id: true, code: true, isSystem: true },
  })
  if (units.length !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 단위가 섞여 있습니다.')
  }
  return units
}

function assertNoSystem(units: { code: string; isSystem: string }[], what: string) {
  const system = units.filter((u) => isYes(u.isSystem)).map((u) => u.code)
  if (system.length > 0) {
    throw new ActionError('CONFLICT', `시스템 단위는 ${what}할 수 없습니다: ${system.join(', ')}`)
  }
}

export async function setUnitsActive(ids: bigint[], isActive: boolean) {
  const units = await findUnits(ids)
  if (!isActive) assertNoSystem(units, '사용 중지')
  const { count } = await prisma.unit.updateMany({
    where: { id: { in: units.map((u) => u.id) } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 품목에서 쓰는 단위 id: 지우지 않은 품목의 기본단위이거나 환산단위인 것 (0041)
// (품목을 지워도 재고 기록이 생기면 그 품목의 단위는 계속 필요하다 → TODO(재고 작업, ROADMAP M4): 재고 표가 생기면 함께 검사)
export async function findUsedUnitIds(ids: bigint[]): Promise<bigint[]> {
  if (ids.length === 0) return []
  const [asBase, asPack] = await Promise.all([
    prisma.item.findMany({
      where: { baseUnitId: { in: ids } },
      select: { baseUnitId: true },
      distinct: ['baseUnitId'],
    }),
    prisma.itemUnit.findMany({
      where: { unitId: { in: ids }, item: NOT_DELETED },
      select: { unitId: true },
      distinct: ['unitId'],
    }),
  ])
  return [...new Set([...asBase.map((r) => r.baseUnitId), ...asPack.map((r) => r.unitId)])]
}

export async function deleteUnits(ids: bigint[]) {
  const units = await findUnits(ids)
  assertNoSystem(units, '삭제')
  if ((await findUsedUnitIds(units.map((u) => u.id))).length > 0) {
    throw new ActionError('CONFLICT', '품목에서 쓰는 단위는 지울 수 없습니다. 사용 중지하세요.')
  }
  return prisma.$transaction(async (tx) => {
    for (const unit of units) await deleteExternalCodes(tx, 'UNIT', unit.id)
    // 논리 삭제 (되살릴 수 있다). 외부 코드는 지운다
    const { count } = await tx.unit.updateMany({
      where: { id: { in: units.map((u) => u.id) } },
      data: DELETED_ONLY,
    })
    return { count }
  })
}

// 되살리기: 지운 단위를 다시 목록에 (같은 코드가 이미 다시 생겼으면 거부)
export async function restoreUnits(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const units = await tx.unit.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { code: true },
    })
    assertAllFound(units.length, ids.length, '단위')
    const taken = await tx.unit.findMany({
      where: { code: { in: units.map((u) => u.code) } },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '단위 코드',
    )
    const { count } = await tx.unit.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
