import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { timeToDate } from '@/lib/format/time'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertInScope, type DataScope } from '@/lib/scope/data-scope'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, toStatus } from '@/lib/status'
import type { RouteCreateData, RouteData } from './route-schema'

// 배송 코스 (docs/decisions/0095): 센터 안에서 어느 차·어느 길로 보내는지
// 센터 직원은 소속 센터 코스만 (데이터 범위 centerId). 코드·사용자 정의 코드는 센터 안에서 고유

export const VEHICLE_TON_GROUP = 'VEHICLE_TON'

const scopeOf = (row: { operatorId: bigint; centerId: bigint } | null) => row
const CENTER = { center: 'centerId' } as const

async function assertCustCode(
  db: Db,
  centerId: bigint,
  custCode: string | null,
  exceptId?: bigint,
) {
  if (!custCode) return
  const owner = await db.route.findFirst({
    where: { centerId, custCode },
    select: { id: true, code: true },
  })
  if (owner && owner.id !== exceptId) {
    throw new ActionError(
      'CONFLICT',
      `같은 센터의 다른 코스(${owner.code})가 쓰는 사용자 정의 코드입니다: ${custCode}`,
    )
  }
}

// 수송 수단: 이 운영사의 사용 중인 운송사 (이미 정해 둔 것은 사용 중지돼도 그대로 둘 수 있다)
async function assertCarrier(db: Db, carrierId: bigint | null, keep: bigint | null = null) {
  if (carrierId === null || carrierId === keep) return
  const carrier = await db.carrier.findUnique({
    where: { id: carrierId },
    select: { status: true, code: true },
  })
  if (!carrier) throw new ActionError('NOT_FOUND', '운송사를 찾을 수 없습니다.')
  if (carrier.status !== 'ACTIVE') {
    throw new ActionError('CONFLICT', `사용 중지한 운송사입니다: ${carrier.code}`)
  }
}

const fieldsOf = (data: RouteData) => ({
  custCode: data.custCode,
  name: data.name,
  carrierId: data.carrierId,
  runDays: data.runDays,
  cutoffTime: data.cutoffTime ? timeToDate(data.cutoffTime) : null,
  vehicleTon: data.vehicleTon,
  destHub: data.destHub,
  status: data.status,
  sortOrder: data.sortOrder,
  remark: data.remark,
})

export async function createRoute(data: RouteCreateData, scope: DataScope) {
  return prisma.$transaction(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: data.centerId },
      select: { id: true, operatorId: true },
    })
    assertInScope(scope, center && { operatorId: center.operatorId, centerId: center.id }, CENTER)
    const taken = await tx.route.findFirst({
      where: { centerId: data.centerId, code: data.code },
      select: { id: true },
    })
    if (taken)
      throw new ActionError('CONFLICT', `이 센터에 이미 있는 코스 코드입니다: ${data.code}`)
    await assertCustCode(tx, data.centerId, data.custCode)
    await assertCarrier(tx, data.carrierId)
    await assertCodeValues(tx, VEHICLE_TON_GROUP, data.vehicleTon ? [data.vehicleTon] : [], {
      label: '차량 톤수',
    })
    return tx.route.create({
      data: {
        ...fieldsOf(data),
        centerId: data.centerId,
        code: data.code,
        operatorId: requireOperatorId(),
      },
      select: { id: true, rowVersion: true },
    })
  })
}

export async function updateRoute(
  id: bigint,
  rowVersion: number,
  data: RouteData,
  scope: DataScope,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.route.findUnique({
      where: { id },
      select: {
        operatorId: true,
        centerId: true,
        rowVersion: true,
        carrierId: true,
        vehicleTon: true,
      },
    })
    assertInScope(scope, scopeOf(found), CENTER)
    assertRowVersion(found, rowVersion, '배송 코스를 찾을 수 없습니다.')
    const current = found!
    await assertCustCode(tx, current.centerId, data.custCode, id)
    await assertCarrier(tx, data.carrierId, current.carrierId)
    await assertCodeValues(tx, VEHICLE_TON_GROUP, data.vehicleTon ? [data.vehicleTon] : [], {
      label: '차량 톤수',
      keep: current.vehicleTon ? [current.vehicleTon] : [],
    })
    return withVersionGuard(() =>
      tx.route.update({
        where: { id, rowVersion },
        data: fieldsOf(data),
        select: { id: true, rowVersion: true },
      }),
    )
  })
}

// 여러 건 고르기: 모두 범위 안 (deleted: 지운 것을 고를 때)
export async function assertRoutesInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const rows = await prisma.route.findMany({
    where: { id: { in: ids }, ...(deleted ? DELETED_ONLY : {}) },
    select: { id: true, operatorId: true, centerId: true, code: true },
  })
  if (rows.length !== ids.length) {
    throw new ActionError(
      'NOT_FOUND',
      '찾을 수 없는 코스가 섞여 있습니다. 목록을 새로 고쳐 주세요.',
    )
  }
  for (const row of rows) assertInScope(scope, row, CENTER)
  return rows
}

export async function setRoutesActive(ids: bigint[], isActive: boolean) {
  const { count } = await prisma.route.updateMany({
    where: { id: { in: ids } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 지우기 (되살릴 수 있다): 납품처가 직접 지정한 코스는 거부. 우편번호 배정은 함께 없어진다 (되살려도 다시 배정)
export async function deleteRoutes(rows: { id: bigint; code: string }[]) {
  const ids = rows.map((r) => r.id)
  const used = await prisma.shipTo.findMany({
    where: { routeId: { in: ids } },
    distinct: ['routeId'],
    select: { routeId: true },
  })
  if (used.length > 0) {
    const usedIds = new Set(used.map((u) => u.routeId))
    const codes = rows.filter((r) => usedIds.has(r.id)).map((r) => r.code)
    throw new ActionError(
      'CONFLICT',
      `납품처가 직접 지정한 코스는 삭제할 수 없습니다. 사용 중지하거나 납품처의 코스를 바꿔 주세요: ${codes.join(', ')}`,
    )
  }
  const [, , result] = await prisma.$transaction([
    prisma.routeZip.deleteMany({ where: { routeId: { in: ids } } }),
    prisma.externalCode.deleteMany({ where: { entityType: 'ROUTE', entityId: { in: ids } } }),
    prisma.route.updateMany({ where: { id: { in: ids } }, data: DELETED_ONLY }),
  ])
  return { count: result.count }
}

// 되살리기: 같은 센터에 같은 코드(또는 사용자 정의 코드)가 다시 생겼으면 거부
export async function restoreRoutes(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.route.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { centerId: true, code: true, custCode: true },
    })
    assertAllFound(rows.length, ids.length, '배송 코스')
    const taken = await tx.route.findMany({
      where: { OR: rows.map((r) => ({ centerId: r.centerId, code: r.code })) },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '코스 코드',
    )
    const withCust = rows.filter((r) => r.custCode)
    if (withCust.length > 0) {
      const takenCust = await tx.route.findMany({
        where: { OR: withCust.map((r) => ({ centerId: r.centerId, custCode: r.custCode })) },
        select: { custCode: true },
      })
      assertNoCodeConflict(
        takenCust.flatMap((t) => (t.custCode ? [t.custCode] : [])),
        '사용자 정의 코드',
      )
    }
    const { count } = await tx.route.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
