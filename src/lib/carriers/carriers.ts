import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, toStatus } from '@/lib/status'
import type { CarrierCreateData, CarrierData } from './carrier-schema'

// 운송사 (docs/decisions/0094): 운영사마다 한 벌 (기본 7곳은 운영사를 만들 때 복사)
// 운송 계약·화주 기본 택배사가 쓰고 있으면 지울 수 없다 (사용 중지는 된다 — 새 계약에서만 빠진다)

// 사용자 정의 코드는 운영사 안에서 겹치지 않게
async function assertCustCode(db: Db, custCode: string | null, exceptId?: bigint) {
  if (!custCode) return
  const owner = await db.carrier.findFirst({
    where: { custCode },
    select: { id: true, code: true },
  })
  if (owner && owner.id !== exceptId) {
    throw new ActionError(
      'CONFLICT',
      `다른 운송사(${owner.code})가 쓰는 사용자 정의 코드입니다: ${custCode}`,
    )
  }
}

// 고른 운송사가 모두 이 운영사에 있는지 (하나라도 없으면 전체 거부)
function assertFound(found: number, wanted: number) {
  if (found !== wanted) {
    throw new ActionError(
      'NOT_FOUND',
      '찾을 수 없는 운송사가 섞여 있습니다. 목록을 새로 고쳐 주세요.',
    )
  }
}

const fieldsOf = (data: CarrierData) => ({
  custCode: data.custCode,
  name: data.name,
  carrierType: data.carrierType,
  invoiceDigits: data.invoiceDigits,
  invoiceCheck: data.invoiceCheck,
  trackingUrl: data.trackingUrl,
  tel: data.tel,
  status: data.status,
  sortOrder: data.sortOrder,
  remark: data.remark,
})

export async function createCarrier(data: CarrierCreateData) {
  return prisma.$transaction(async (tx) => {
    const taken = await tx.carrier.findFirst({ where: { code: data.code }, select: { id: true } })
    if (taken) throw new ActionError('CONFLICT', `이미 있는 운송사 코드입니다: ${data.code}`)
    await assertCustCode(tx, data.custCode)
    return tx.carrier.create({
      data: { ...fieldsOf(data), code: data.code, operatorId: requireOperatorId() },
      select: { id: true, code: true, rowVersion: true },
    })
  })
}

export async function updateCarrier(id: bigint, rowVersion: number, data: CarrierData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.carrier.findUnique({ where: { id }, select: { rowVersion: true } })
    assertRowVersion(found, rowVersion, '운송사를 찾을 수 없습니다.')
    await assertCustCode(tx, data.custCode, id)
    return withVersionGuard(() =>
      tx.carrier.update({
        where: { id, rowVersion },
        data: fieldsOf(data),
        select: { id: true, code: true, rowVersion: true },
      }),
    )
  })
}

export async function setCarriersActive(ids: bigint[], isActive: boolean) {
  assertFound(await prisma.carrier.count({ where: { id: { in: ids } } }), ids.length)
  const { count } = await prisma.carrier.updateMany({
    where: { id: { in: ids } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 지우기 (되살릴 수 있다): 운송 계약·화주 기본 택배사에 쓰였으면 거부 (사용 중지로 안내)
export async function deleteCarriers(ids: bigint[]) {
  const rows = await prisma.carrier.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true },
  })
  assertFound(rows.length, ids.length)
  const [contracts, shippers] = await Promise.all([
    prisma.carrierContract.findMany({
      where: { carrierId: { in: ids } },
      distinct: ['carrierId'],
      select: { carrierId: true },
    }),
    prisma.shipper.findMany({
      where: { defaultCarrierId: { in: ids } },
      distinct: ['defaultCarrierId'],
      select: { defaultCarrierId: true },
    }),
  ])
  const used = new Set<bigint>([
    ...contracts.map((c) => c.carrierId),
    ...shippers.flatMap((s) => (s.defaultCarrierId === null ? [] : [s.defaultCarrierId])),
  ])
  if (used.size > 0) {
    const codes = rows.filter((r) => used.has(r.id)).map((r) => r.code)
    throw new ActionError(
      'CONFLICT',
      `운송 계약이나 화주사 기본 택배사에 쓰인 운송사는 삭제할 수 없습니다. 사용 중지해 주세요: ${codes.join(', ')}`,
    )
  }
  const [, result] = await prisma.$transaction([
    prisma.externalCode.deleteMany({ where: { entityType: 'CARRIER', entityId: { in: ids } } }),
    prisma.carrier.updateMany({ where: { id: { in: ids } }, data: DELETED_ONLY }),
  ])
  return { count: result.count }
}

// 되살리기: 같은 코드(또는 사용자 정의 코드)가 다시 생겼으면 거부
export async function restoreCarriers(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.carrier.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { id: true, code: true, custCode: true },
    })
    assertAllFound(rows.length, ids.length, '운송사')
    const taken = await tx.carrier.findMany({
      where: { code: { in: rows.map((r) => r.code) } },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '운송사 코드',
    )
    const custCodes = rows.flatMap((r) => (r.custCode ? [r.custCode] : []))
    if (custCodes.length > 0) {
      const takenCust = await tx.carrier.findMany({
        where: { custCode: { in: custCodes } },
        select: { custCode: true },
      })
      assertNoCodeConflict(
        takenCust.flatMap((t) => (t.custCode ? [t.custCode] : [])),
        '사용자 정의 코드',
      )
    }
    const { count } = await tx.carrier.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}

// 고르기 목록 (운송 계약·화주 기본 택배사): 사용 중인 운송사, 정렬 순서대로
export async function carrierOptions(db: Db, operatorId: bigint, keepIds: bigint[] = []) {
  const rows = await db.carrier.findMany({
    where: {
      operatorId,
      OR: [{ status: 'ACTIVE' }, ...(keepIds.length > 0 ? [{ id: { in: keepIds } }] : [])],
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      carrierType: true,
      invoiceDigits: true,
      invoiceCheck: true,
      status: true,
    },
  })
  return rows
}
