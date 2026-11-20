import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertInScope, type DataScope } from '@/lib/scope/data-scope'
import { assertAllFound } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, toStatus } from '@/lib/status'
import { isYes, toYn } from '@/lib/yn'
import type { InvoiceCheckRule } from './carrier-codes'
import type { ContractData } from './contract-schema'
import { bodyDigitsOf } from './invoice-no'

// 운송 계약 (docs/decisions/0094): 센터(·화주)별 택배사 계약
// - 화주를 비우면 센터 공용 계약. 출고 때 고르는 순서: 화주×센터 계약 → 센터 공용 → 화주 기본 택배사
// - 송장 대역(본번호)은 택배사 송장 규칙(자릿수·체크디지트)에 맞아야 하고, 같은 택배사의 다른 계약과 겹치면 안 된다
// - 같은 센터·화주 범위에서 기본 계약은 하나 (저장하면 나머지의 기본 표시를 내린다)

const dateOf = (text: string | null) => (text ? new Date(`${text}T00:00:00.000Z`) : null)

type Range = { start: string; end: string }
const overlaps = (a: Range, b: Range) =>
  BigInt(a.start) <= BigInt(b.end) && BigInt(b.start) <= BigInt(a.end)

// 같은 택배사의 다른 계약과 대역이 겹치는지 (지운 계약은 빼고)
async function assertNoOverlap(db: Db, carrierId: bigint, range: Range, exceptId?: bigint) {
  const others = await db.carrierContract.findMany({
    where: {
      carrierId,
      invoiceStart: { not: null },
      ...(exceptId !== undefined && { id: { not: exceptId } }),
    },
    select: {
      invoiceStart: true,
      invoiceEnd: true,
      custNo: true,
      center: { select: { code: true } },
    },
  })
  const hit = others.find(
    (o) =>
      o.invoiceStart !== null &&
      o.invoiceEnd !== null &&
      o.invoiceStart.length === range.start.length &&
      overlaps({ start: o.invoiceStart, end: o.invoiceEnd }, range),
  )
  if (hit) {
    throw new ActionError(
      'CONFLICT',
      `같은 택배사의 다른 계약(${hit.center.code} · 고객코드 ${hit.custNo})과 송장 대역이 겹칩니다: ${hit.invoiceStart} ~ ${hit.invoiceEnd}`,
    )
  }
}

// 저장 전 검사: 운송사·센터(데이터 범위)·화주(그 센터를 이용)·중복·송장 대역
async function checkContract(
  db: Db,
  data: ContractData,
  scope: DataScope,
  current?: { id: bigint; carrierId: bigint },
) {
  const carrier = await db.carrier.findUnique({
    where: { id: data.carrierId },
    select: {
      code: true,
      status: true,
      carrierType: true,
      invoiceDigits: true,
      invoiceCheck: true,
    },
  })
  if (!carrier) throw new ActionError('NOT_FOUND', '운송사를 찾을 수 없습니다.')
  // 사용 중지한 운송사는 새로 고를 수 없다 (이미 그 운송사인 계약은 그대로 고칠 수 있다)
  if (carrier.status !== 'ACTIVE' && current?.carrierId !== data.carrierId) {
    throw new ActionError('CONFLICT', `사용 중지한 운송사입니다: ${carrier.code}`)
  }
  const center = await db.center.findUnique({
    where: { id: data.centerId },
    select: { id: true, operatorId: true },
  })
  assertInScope(scope, center && { operatorId: center.operatorId, centerId: center.id }, {
    center: 'centerId',
  })
  if (data.shipperId !== null) {
    const link = await db.shipperCenter.findFirst({
      where: { shipperId: data.shipperId, centerId: data.centerId, shipper: { delYn: 'N' } },
      select: { shipperId: true },
    })
    if (!link) {
      throw new ActionError('VALIDATION', '이 센터를 이용하는 화주사가 아닙니다.')
    }
  }
  const duplicate = await db.carrierContract.findFirst({
    where: {
      carrierId: data.carrierId,
      centerId: data.centerId,
      shipperId: data.shipperId,
      custNo: data.custNo,
      ...(current && { id: { not: current.id } }),
    },
    select: { id: true },
  })
  if (duplicate) {
    throw new ActionError('CONFLICT', `같은 센터·화주에 이미 있는 고객코드입니다: ${data.custNo}`)
  }
  if (data.invoiceStart !== null && data.invoiceEnd !== null) {
    if (carrier.carrierType !== 'PARCEL') {
      throw new ActionError('VALIDATION', '송장 대역은 택배 운송사만 넣을 수 있습니다.')
    }
    const digits = bodyDigitsOf(carrier.invoiceDigits, carrier.invoiceCheck as InvoiceCheckRule)
    if (digits !== null && data.invoiceStart.length !== digits) {
      const message = `${carrier.code}의 본번호는 ${digits}자리입니다 (송장 ${carrier.invoiceDigits}자리${carrier.invoiceCheck === 'NONE' ? '' : ', 끝자리 체크디지트 제외'}).`
      throw new ActionError('VALIDATION', message)
    }
    await assertNoOverlap(
      db,
      data.carrierId,
      { start: data.invoiceStart, end: data.invoiceEnd },
      current?.id,
    )
  }
}

const fieldsOf = (data: ContractData) => ({
  carrierId: data.carrierId,
  centerId: data.centerId,
  shipperId: data.shipperId,
  custNo: data.custNo,
  pickupBranch: data.pickupBranch,
  invoiceStart: data.invoiceStart,
  invoiceEnd: data.invoiceEnd,
  // 다음 번호를 비우면 시작 번호부터
  invoiceNext: data.invoiceNext ?? data.invoiceStart,
  defaultYn: toYn(data.isDefault),
  validFrom: dateOf(data.validFrom),
  validTo: dateOf(data.validTo),
  status: data.status,
  remark: data.remark,
})

// 기본 계약은 같은 센터·화주 범위에 하나: 이 계약을 기본으로 하면 나머지의 기본 표시를 내린다
async function keepSingleDefault(db: Db, id: bigint, data: ContractData) {
  if (!data.isDefault) return
  await db.carrierContract.updateMany({
    where: { centerId: data.centerId, shipperId: data.shipperId, defaultYn: 'Y', id: { not: id } },
    data: { defaultYn: 'N' },
  })
}

export async function createContract(data: ContractData, scope: DataScope) {
  return prisma.$transaction(async (tx) => {
    await checkContract(tx, data, scope)
    const created = await tx.carrierContract.create({
      data: { ...fieldsOf(data), operatorId: requireOperatorId() },
      select: { id: true, rowVersion: true },
    })
    await keepSingleDefault(tx, created.id, data)
    return created
  })
}

export async function updateContract(
  id: bigint,
  rowVersion: number,
  data: ContractData,
  scope: DataScope,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.carrierContract.findUnique({
      where: { id },
      select: { id: true, operatorId: true, centerId: true, carrierId: true, rowVersion: true },
    })
    // 지금 센터가 범위 밖이면 "찾을 수 없음"
    assertInScope(scope, found, { center: 'centerId' })
    assertRowVersion(found, rowVersion, '운송 계약을 찾을 수 없습니다.')
    await checkContract(tx, data, scope, { id, carrierId: found!.carrierId })
    const saved = await withVersionGuard(() =>
      tx.carrierContract.update({
        where: { id, rowVersion },
        data: fieldsOf(data),
        select: { id: true, rowVersion: true },
      }),
    )
    await keepSingleDefault(tx, id, data)
    return saved
  })
}

// 여러 건 고르기 검사: 모두 범위 안 (deleted: 지운 것을 고를 때)
export async function assertContractsInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const rows = await prisma.carrierContract.findMany({
    where: { id: { in: ids }, ...(deleted ? DELETED_ONLY : {}) },
    select: { id: true, operatorId: true, centerId: true },
  })
  if (rows.length !== ids.length) {
    throw new ActionError(
      'NOT_FOUND',
      '찾을 수 없는 운송 계약이 섞여 있습니다. 목록을 새로 고쳐 주세요.',
    )
  }
  for (const row of rows) assertInScope(scope, row, { center: 'centerId' })
  return ids
}

export async function setContractsActive(ids: bigint[], isActive: boolean) {
  const { count } = await prisma.carrierContract.updateMany({
    where: { id: { in: ids } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 지우기 (되살릴 수 있다). 출고 송장이 생기면 그때 "쓰인 계약은 삭제 불가"를 더한다
export async function deleteContracts(ids: bigint[]) {
  const { count } = await prisma.carrierContract.updateMany({
    where: { id: { in: ids } },
    data: { ...DELETED_ONLY, defaultYn: 'N' },
  })
  return { count }
}

// 되살리기: 같은 고객코드가 다시 생겼거나 송장 대역이 다른 계약과 겹치면 거부
export async function restoreContracts(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.carrierContract.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: {
        id: true,
        carrierId: true,
        centerId: true,
        shipperId: true,
        custNo: true,
        invoiceStart: true,
        invoiceEnd: true,
      },
    })
    assertAllFound(rows.length, ids.length, '운송 계약')
    for (const row of rows) {
      const duplicate = await tx.carrierContract.findFirst({
        where: {
          carrierId: row.carrierId,
          centerId: row.centerId,
          shipperId: row.shipperId,
          custNo: row.custNo,
        },
        select: { id: true },
      })
      if (duplicate) {
        throw new ActionError(
          'CONFLICT',
          `같은 고객코드의 계약이 이미 있어 되살릴 수 없습니다: ${row.custNo}`,
        )
      }
      if (row.invoiceStart !== null && row.invoiceEnd !== null) {
        await assertNoOverlap(tx, row.carrierId, { start: row.invoiceStart, end: row.invoiceEnd })
      }
    }
    const { count } = await tx.carrierContract.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}

// 출고 때 쓸 계약 찾기 (0094 결정 순서): 화주×센터 → 센터 공용. 같은 범위 안에서는 기본 계약 → 정렬
// 오늘(한국 날짜)이 유효기간 안이고 사용 중인 계약만. 없으면 null (화주 기본 택배사는 부르는 쪽이 본다)
export async function findContractFor(
  db: Db,
  input: { centerId: bigint; shipperId: bigint; carrierId?: bigint; today: string },
) {
  const day = new Date(`${input.today}T00:00:00.000Z`)
  const candidates = await db.carrierContract.findMany({
    where: {
      centerId: input.centerId,
      OR: [{ shipperId: input.shipperId }, { shipperId: null }],
      status: 'ACTIVE',
      carrier: { status: 'ACTIVE', delYn: 'N' },
      ...(input.carrierId !== undefined && { carrierId: input.carrierId }),
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: day } }] },
        { OR: [{ validTo: null }, { validTo: { gte: day } }] },
      ],
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, shipperId: true, defaultYn: true, carrierId: true, custNo: true },
  })
  const rank = (c: (typeof candidates)[number]) =>
    (c.shipperId === null ? 2 : 0) + (isYes(c.defaultYn) ? 0 : 1)
  return [...candidates].sort((a, b) => rank(a) - rank(b))[0] ?? null
}
