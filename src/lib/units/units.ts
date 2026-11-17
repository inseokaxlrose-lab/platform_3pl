import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { deleteExternalCodes } from '@/lib/master-code/external-codes'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, toStatus, withStatus } from '@/lib/status'
import { isYes } from '@/lib/yn'
import { decimalText } from './unit-format'
import { isPhysicalType, UNIT_TYPE_LABELS, type UnitTypeValue } from './unit-labels'
import type { UnitCreateData, UnitUpdateData } from './unit-schema'
import { findDecimalOverflow, findUnitUsage, usageText } from './unit-usage'

// 단위 저장 (docs/decisions/0034·0078). 권한 검사는 서버 액션에서 한다
// - 시스템 기본 단위(operator_id 없음)는 운영사가 고칠 수 없다 (prisma.ts도 수정·삭제를 지금 운영사 줄로만 거른다)
// - 코드·유형은 등록 후 바꿀 수 없다. 시스템 단위와 같은 코드로 운영사 단위를 만들 수 없다
// - 삭제는 어디서도 쓰지 않는 단위만 (unit-usage.ts). 사용 중지·환산계수 변경은 쓰는 곳을 경고로 알린다

// 유형 기준단위 (시스템 단위: EA·KG·L·M·M2) — 물리 단위의 base_unit_id
async function baseUnitOf(db: Db, type: UnitTypeValue) {
  return db.unit.findFirst({
    where: { type, isBase: 'Y', operatorId: null },
    select: { id: true, code: true },
  })
}

async function assertFreeCode(db: Db, code: string) {
  // 읽기는 "시스템 + 지금 운영사"라 시스템 코드와의 겹침도 함께 걸린다
  const taken = await db.unit.findFirst({ where: { code }, select: { isSystem: true } })
  if (taken) {
    throw new ActionError(
      'CONFLICT',
      isYes(taken.isSystem)
        ? `시스템 기본 단위와 같은 코드입니다: ${code}`
        : `이미 있는 단위 코드입니다: ${code}`,
    )
  }
}

// 저장할 칸 (화면 입력 → DB)
const columns = (data: Omit<UnitCreateData, 'code' | 'type'> | UnitUpdateData) => ({
  name: data.name,
  nameEn: data.nameEn,
  printName: data.printName,
  decimals: data.decimals,
  sortOrder: data.sortOrder,
  baseFactor: data.baseFactor,
  stdCode: data.stdCode,
  description: data.description,
  remark: data.remark,
})

export async function createUnit(data: UnitCreateData) {
  const operatorId = requireOperatorId()
  await assertFreeCode(prisma, data.code)
  const base = isPhysicalType(data.type) ? await baseUnitOf(prisma, data.type) : null
  if (isPhysicalType(data.type) && !base) {
    throw new ActionError('VALIDATION', `${UNIT_TYPE_LABELS[data.type]} 기준단위가 없습니다.`)
  }
  return prisma.unit.create({
    data: {
      ...withStatus({ isActive: data.isActive }),
      ...columns(data),
      code: data.code,
      type: data.type,
      baseUnitId: base?.id ?? null,
      operatorId,
    },
    select: { id: true, code: true },
  })
}

// 환산계수 변경 기록 (확장속성에 쌓는다: 언제·누가·이전·이후)
type FactorChange = { at: string; by: string; from: string | null; to: string | null }
const factorHistory = (extAttr: unknown): FactorChange[] => {
  const list = (extAttr as { baseFactorHistory?: FactorChange[] } | null)?.baseFactorHistory
  return Array.isArray(list) ? list : []
}

// rowVersion: 화면을 열 때의 버전 (그 사이 다른 사람이 저장했으면 충돌)
// 돌려주는 notice: 저장은 됐지만 알릴 것 (사용 중 단위의 사용 중지·환산계수 변경)
export async function updateUnit({ id, rowVersion, ...data }: UnitUpdateData) {
  const operatorId = requireOperatorId()
  const found = await prisma.unit.findUnique({
    where: { id },
    select: {
      code: true,
      type: true,
      isSystem: true,
      decimals: true,
      baseFactor: true,
      status: true,
      extAttr: true,
      rowVersion: true,
    },
  })
  assertRowVersion(found, rowVersion, '단위를 찾을 수 없습니다.')
  const current = found!
  if (isYes(current.isSystem)) {
    throw new ActionError('FORBIDDEN', `시스템 기본 단위(${current.code})는 고칠 수 없습니다.`)
  }
  if (data.type !== current.type) {
    throw new ActionError('VALIDATION', '단위 유형은 등록 후 바꿀 수 없습니다.')
  }

  // 소수 자리수 축소: 이미 더 많은 소수 자리로 저장된 수량이 있으면 막는다
  if (data.decimals < current.decimals) {
    const over = await findDecimalOverflow(prisma, operatorId, id, data.decimals)
    if (over.length > 0) {
      throw new ActionError(
        'CONFLICT',
        `소수 ${data.decimals}자리보다 많은 수량이 있어 줄일 수 없습니다: ${over.join(', ')}`,
      )
    }
  }

  const notices: string[] = []
  const [usage] = await findUnitUsage(prisma, operatorId, [{ id, code: current.code }])
  const before = current.baseFactor ? decimalText(current.baseFactor.toString()) : null
  const after = data.baseFactor ? decimalText(data.baseFactor) : null
  const factorChanged = before !== after
  if (factorChanged && usage.uses.length > 0) {
    notices.push(`환산계수를 바꿨습니다. 이 단위는 ${usageText(usage.uses)}에서 쓰고 있습니다.`)
  }
  const deactivating = !data.isActive && current.status === 'ACTIVE'
  if (deactivating && usage.uses.length > 0) {
    notices.push(`사용 중지했습니다. ${usageText(usage.uses)}의 기존 데이터는 그대로 보입니다.`)
  }

  const extAttr = factorChanged
    ? {
        ...((current.extAttr as object | null) ?? {}),
        baseFactorHistory: [
          ...factorHistory(current.extAttr),
          { at: new Date().toISOString(), by: currentActor(), from: before, to: after },
        ],
      }
    : undefined

  const saved = await withVersionGuard(() =>
    prisma.unit.update({
      where: { id, rowVersion },
      data: {
        ...withStatus({ isActive: data.isActive }),
        ...columns(data),
        ...(extAttr ? { extAttr } : {}),
      },
      select: { rowVersion: true },
    }),
  )
  return { id, rowVersion: saved.rowVersion, notice: notices.join(' ') || undefined }
}

// 고른 운영사 단위 (하나라도 없거나 시스템 단위가 섞이면 전체 거부)
async function findOwnUnits(ids: bigint[], what: string) {
  const unique = [...new Set(ids)]
  const units = await prisma.unit.findMany({
    where: { id: { in: unique } },
    select: { id: true, code: true, isSystem: true },
  })
  if (units.length !== unique.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 단위가 섞여 있습니다.')
  }
  const system = units.filter((u) => isYes(u.isSystem)).map((u) => u.code)
  if (system.length > 0) {
    throw new ActionError(
      'FORBIDDEN',
      `시스템 기본 단위는 ${what}할 수 없습니다: ${system.join(', ')}`,
    )
  }
  return units
}

// 일괄 사용 중지·다시 사용. 사용 중지는 쓰는 곳을 경고로 알린다
export async function setUnitsActive(ids: bigint[], isActive: boolean) {
  const operatorId = requireOperatorId()
  const units = await findOwnUnits(ids, isActive ? '다시 사용' : '사용 중지')
  const { count } = await prisma.unit.updateMany({
    where: { id: { in: units.map((u) => u.id) } },
    data: { status: toStatus(isActive) },
  })
  const used = isActive
    ? []
    : (await findUnitUsage(prisma, operatorId, units)).filter((u) => u.uses.length)
  const notice = used.length
    ? `쓰는 곳이 있는 단위: ${used.map((u) => `${u.code}(${usageText(u.uses)})`).join(', ')} — 기존 데이터는 그대로 보이고 새로 고를 때만 빠집니다.`
    : undefined
  return { count, notice }
}

export async function deleteUnits(ids: bigint[]) {
  const operatorId = requireOperatorId()
  const units = await findOwnUnits(ids, '삭제')
  const used = (await findUnitUsage(prisma, operatorId, units)).filter((u) => u.uses.length)
  if (used.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `쓰는 곳이 있어 지울 수 없습니다. 사용 중지하세요: ${used.map((u) => `${u.code}(${usageText(u.uses)})`).join(', ')}`,
    )
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

// 되살리기: 지운 단위를 다시 목록에 (같은 코드가 이미 다시 생겼거나 시스템 코드와 겹치면 거부)
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
