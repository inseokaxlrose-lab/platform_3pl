import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { deleteExternalCodes, saveExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import type { UnitCreateData, UnitUpdateData } from './unit-schema'

// 단위 저장 (docs/decisions/0034). 권한 검사는 서버 액션에서 한다
// - 코드는 등록 후 바꿀 수 없다
// - 시스템 단위(EA·BOX·PLT): 삭제·사용 중지·종류 변경 불가
// - 삭제는 품목에서 쓰지 않는 단위만 (사용 검사는 품목 작업 때 채운다)

export async function createUnit({ externalCodes, ...data }: UnitCreateData) {
  if (await prisma.unit.findUnique({ where: { code: data.code } })) {
    throw new ActionError('CONFLICT', `이미 있는 단위 코드입니다: ${data.code}`)
  }
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.create({ data, select: { id: true, code: true } })
    await saveExternalCodes(tx, 'UNIT', unit.id, externalCodes)
    return unit
  })
}

export async function updateUnit({ id, externalCodes, ...data }: UnitUpdateData) {
  const current = await prisma.unit.findUnique({
    where: { id },
    select: { code: true, kind: true, isSystem: true },
  })
  if (!current) throw new ActionError('NOT_FOUND', '단위를 찾을 수 없습니다.')
  if (current.isSystem) {
    if (data.kind !== current.kind) {
      throw new ActionError('VALIDATION', `시스템 단위(${current.code})의 종류는 바꿀 수 없습니다.`)
    }
    if (!data.isActive) {
      throw new ActionError('VALIDATION', `시스템 단위(${current.code})는 사용 중지할 수 없습니다.`)
    }
  }
  return prisma.$transaction(async (tx) => {
    await tx.unit.update({ where: { id }, data })
    await saveExternalCodes(tx, 'UNIT', id, externalCodes)
    return { id }
  })
}

// 고른 단위 (하나라도 없으면 전체 거부)
async function findUnits(ids: string[]) {
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

function assertNoSystem(units: { code: string; isSystem: boolean }[], what: string) {
  const system = units.filter((u) => u.isSystem).map((u) => u.code)
  if (system.length > 0) {
    throw new ActionError('CONFLICT', `시스템 단위는 ${what}할 수 없습니다: ${system.join(', ')}`)
  }
}

export async function setUnitsActive(ids: string[], isActive: boolean) {
  const units = await findUnits(ids)
  if (!isActive) assertNoSystem(units, '사용 중지')
  const { count } = await prisma.unit.updateMany({
    where: { id: { in: units.map((u) => u.id) } },
    data: { isActive },
  })
  return { count }
}

// 품목에서 쓰는 단위 id
// TODO(품목 작업, ROADMAP M3 화주사 품목 관리): 품목·환산단위 표가 생기면 여기서 검사한다. 지금은 빈 목록
export async function findUsedUnitIds(ids: string[]): Promise<string[]> {
  void ids
  return []
}

export async function deleteUnits(ids: string[]) {
  const units = await findUnits(ids)
  assertNoSystem(units, '삭제')
  if ((await findUsedUnitIds(units.map((u) => u.id))).length > 0) {
    throw new ActionError('CONFLICT', '품목에서 쓰는 단위는 지울 수 없습니다. 사용 중지하세요.')
  }
  return prisma.$transaction(async (tx) => {
    for (const unit of units) await deleteExternalCodes(tx, 'UNIT', unit.id)
    const { count } = await tx.unit.deleteMany({ where: { id: { in: units.map((u) => u.id) } } })
    return { count }
  })
}
