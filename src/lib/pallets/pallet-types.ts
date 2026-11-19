import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { DELETED_ONLY } from '@/lib/status'
import { isYes } from '@/lib/yn'
import type { PalletTypeSpec } from '@/lib/items/item-calc'
import type { PalletTypeData } from './pallet-type-schema'

// 팔레트 종류 (docs/decisions/0083) — PLT 계산 기준
// 시스템 기본(operator_id NULL, 모든 운영사 공용, 고칠 수 없음) + 운영사 행
// 운영사 행이 같은 코드의 시스템 행을 덮어쓴다 (예: 이 운영사는 T11 권장 높이 150cm). 운영사 행을 지우면 시스템 값으로 돌아간다

const SELECT = {
  id: true,
  operatorId: true,
  code: true,
  name: true,
  widthCm: true,
  depthCm: true,
  heightCm: true,
  weightKg: true,
  maxLoadHeightCm: true,
  maxLoadWeightKg: true,
  isSystem: true,
  status: true,
  sortOrder: true,
  remark: true,
  rowVersion: true,
  updatedAt: true,
  updatedBy: true,
} as const

type Row = Prisma.PalletTypeGetPayload<{ select: typeof SELECT }>

const text = (value: Prisma.Decimal | null) => (value === null ? null : value.toString())

// 화면·계산에 쓰는 모양 (숫자는 글자)
function toView(row: Row, overridden = false) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    widthCm: row.widthCm.toString(),
    depthCm: row.depthCm.toString(),
    heightCm: row.heightCm.toString(),
    weightKg: row.weightKg.toString(),
    maxLoadHeightCm: text(row.maxLoadHeightCm),
    maxLoadWeightKg: text(row.maxLoadWeightKg),
    // SYSTEM = 시스템 기본 그대로 / OPERATOR = 이 운영사가 추가 / OVERRIDE = 시스템 기본을 이 운영사 값으로 덮어씀
    source: isYes(row.isSystem) ? 'SYSTEM' : overridden ? 'OVERRIDE' : 'OPERATOR',
    status: row.status,
    sortOrder: row.sortOrder,
    remark: row.remark,
    rowVersion: row.rowVersion,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  }
}
export type PalletTypeView = ReturnType<typeof toView>

// 이 운영사에서 쓰는 팔레트 종류 (코드마다 하나: 운영사 행 > 시스템 행)
export async function listPalletTypes(
  db: Db,
  operatorId: bigint,
  options: { activeOnly?: boolean } = {},
) {
  const rows = await db.palletType.findMany({
    where: { OR: [{ operatorId: null }, { operatorId }] },
    select: SELECT,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  const systemCodes = new Set(rows.filter((r) => r.operatorId === null).map((r) => r.code))
  const byCode = new Map<string, PalletTypeView>()
  // 시스템 행을 먼저 넣고, 같은 코드의 운영사 행이 덮어쓴다
  for (const row of rows.filter((r) => r.operatorId === null)) byCode.set(row.code, toView(row))
  for (const row of rows.filter((r) => r.operatorId !== null)) {
    byCode.set(row.code, toView(row, systemCodes.has(row.code)))
  }
  const list = [...byCode.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  )
  return options.activeOnly ? list.filter((p) => p.status === 'ACTIVE') : list
}

// 코드 하나의 계산 규격 (운영사 행 > 시스템 행, 사용 중지여도 기존 품목 계산에는 쓴다)
export async function getPalletSpec(
  db: Db,
  operatorId: bigint,
  code: string | null | undefined,
): Promise<PalletTypeSpec | null> {
  if (!code) return null
  const found = (await listPalletTypes(db, operatorId)).find((p) => p.code === code)
  return found ?? null
}

const fieldsOf = (data: PalletTypeData) => ({
  name: data.name,
  widthCm: data.widthCm,
  depthCm: data.depthCm,
  heightCm: data.heightCm,
  weightKg: data.weightKg,
  maxLoadHeightCm: data.maxLoadHeightCm,
  maxLoadWeightKg: data.maxLoadWeightKg,
  status: data.status,
  sortOrder: data.sortOrder,
  remark: data.remark,
})

// 등록: 이 운영사 행. 시스템 코드와 같으면 "시스템 기본을 이 운영사 값으로 덮어쓰기"
export async function createPalletType(data: PalletTypeData & { code: string }) {
  return prisma.$transaction(async (tx) => {
    const operatorId = requireOperatorId()
    const taken = await tx.palletType.findFirst({
      where: { operatorId, code: data.code },
      select: { id: true },
    })
    if (taken) throw new ActionError('CONFLICT', `이미 있는 팔레트 종류 코드입니다: ${data.code}`)
    return tx.palletType.create({
      data: { ...fieldsOf(data), code: data.code, operatorId, isSystem: 'N' },
      select: { id: true, code: true, rowVersion: true },
    })
  })
}

// 수정: 이 운영사 행만 (시스템 행은 prisma.ts가 막는다 — 덮어쓰려면 같은 코드로 등록)
export async function updatePalletType(id: bigint, rowVersion: number, data: PalletTypeData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.palletType.findFirst({
      where: { id, operatorId: requireOperatorId() },
      select: { rowVersion: true },
    })
    assertRowVersion(
      found,
      rowVersion,
      '고칠 수 있는 팔레트 종류가 아닙니다. (시스템 기본은 같은 코드로 등록해 덮어쓰세요)',
    )
    return withVersionGuard(() =>
      tx.palletType.update({
        where: { id, rowVersion },
        data: fieldsOf(data),
        select: { id: true, code: true, rowVersion: true },
      }),
    )
  })
}

// 지우기: 이 운영사 행만 (덮어쓴 행을 지우면 시스템 기본으로 돌아간다). 운영사 기본 팔레트는 지울 수 없다
export async function deletePalletType(id: bigint) {
  return prisma.$transaction(async (tx) => {
    const operatorId = requireOperatorId()
    const found = await tx.palletType.findFirst({
      where: { id, operatorId },
      select: { code: true },
    })
    if (!found)
      throw new ActionError(
        'NOT_FOUND',
        '지울 수 있는 팔레트 종류가 아닙니다. (시스템 기본은 지울 수 없습니다)',
      )
    const operator = await tx.operator.findUniqueOrThrow({
      where: { id: operatorId },
      select: { defaultPalletType: true },
    })
    const system = await tx.palletType.findFirst({
      where: { operatorId: null, code: found.code },
      select: { id: true },
    })
    if (operator.defaultPalletType === found.code && !system) {
      throw new ActionError(
        'CONFLICT',
        '운영사 기본 팔레트는 지울 수 없습니다. 먼저 기본 팔레트를 바꾸세요.',
      )
    }
    await tx.palletType.update({ where: { id }, data: DELETED_ONLY })
    return { count: 1 }
  })
}

// 운영사 기본 팔레트 바꾸기 (품목 팔레트 적재의 기본값)
export async function setDefaultPalletType(code: string) {
  const operatorId = requireOperatorId()
  const list = await listPalletTypes(prisma, operatorId, { activeOnly: true })
  if (!list.some((p) => p.code === code)) {
    throw new ActionError('VALIDATION', `사용 중인 팔레트 종류가 아닙니다: ${code}`)
  }
  await prisma.operator.update({ where: { id: operatorId }, data: { defaultPalletType: code } })
  return { code }
}
