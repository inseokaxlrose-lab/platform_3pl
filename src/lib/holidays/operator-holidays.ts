import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertInScope, type DataScope } from '@/lib/scope/data-scope'
import { assertAllFound } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED } from '@/lib/status'
import type { OperatorHolidayData } from './holiday-schema'

// 운영사 개별 휴일 (docs/decisions/0096): 운영사 전체 또는 센터 지정, 휴무 / 특근
// - 센터 지정 휴일: 그 센터가 데이터 범위 안이어야 한다 (센터 직원은 소속 센터만)
// - 운영사 전체 휴일: 운영사 전체 범위(운영사 관리자)만 등록·수정·삭제한다 (센터 직원은 보기만)

const CENTER = { center: 'centerId' } as const
const dateOf = (text: string) => new Date(`${text}T00:00:00.000Z`)
const textOf = (date: Date) => date.toISOString().slice(0, 10)

type Owner = { operatorId: bigint; centerId: bigint | null }

// 이 사용자가 이 범위의 휴일을 고칠 수 있나
export function assertHolidayWritable(scope: DataScope, row: Owner | null) {
  if (row && row.centerId === null) {
    if (scope.kind !== 'ALL' || scope.operatorId !== row.operatorId) {
      throw new ActionError(
        'FORBIDDEN',
        '운영사 전체 휴일은 운영사 관리자만 바꿀 수 있습니다. 센터를 골라 등록해 주세요.',
      )
    }
    return
  }
  assertInScope(scope, row, CENTER)
}

// 고른 센터가 이 운영사·데이터 범위 안인지 (운영사 전체면 운영사 관리자인지)
async function ownerOf(db: Db, centerId: bigint | null, scope: DataScope): Promise<Owner> {
  const operatorId = requireOperatorId()
  if (centerId === null) {
    const owner = { operatorId, centerId: null }
    assertHolidayWritable(scope, owner)
    return owner
  }
  const center = await db.center.findUnique({
    where: { id: centerId },
    select: { id: true, operatorId: true },
  })
  const owner = center && { operatorId: center.operatorId, centerId: center.id }
  assertHolidayWritable(scope, owner)
  return owner!
}

// 같은 범위에 같은 날짜는 한 건
async function assertDateFree(db: Db, owner: Owner, holidayOn: Date, exceptId?: bigint) {
  const taken = await db.operatorHoliday.findFirst({
    where: {
      holidayOn,
      ...(owner.centerId === null
        ? { operatorId: owner.operatorId, centerId: null }
        : { centerId: owner.centerId }),
      ...(exceptId !== undefined && { id: { not: exceptId } }),
    },
    select: { name: true },
  })
  if (taken) {
    throw new ActionError(
      'CONFLICT',
      `${owner.centerId === null ? '운영사 전체' : '이 센터'}에 이미 등록한 날짜입니다: ${textOf(holidayOn)} (${taken.name})`,
    )
  }
}

const fieldsOf = (data: OperatorHolidayData) => ({
  holidayOn: dateOf(data.holidayOn),
  name: data.name,
  dayType: data.dayType,
  remark: data.remark,
})

export async function createOperatorHoliday(data: OperatorHolidayData, scope: DataScope) {
  return prisma.$transaction(async (tx) => {
    const owner = await ownerOf(tx, data.centerId, scope)
    const fields = fieldsOf(data)
    await assertDateFree(tx, owner, fields.holidayOn)
    return tx.operatorHoliday.create({
      data: { ...fields, operatorId: owner.operatorId, centerId: owner.centerId },
      select: { id: true, rowVersion: true },
    })
  })
}

export async function updateOperatorHoliday(
  id: bigint,
  rowVersion: number,
  data: OperatorHolidayData,
  scope: DataScope,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.operatorHoliday.findUnique({
      where: { id },
      select: { operatorId: true, centerId: true, rowVersion: true },
    })
    // 지금 범위와 바꿀 범위 둘 다 고칠 수 있어야 한다
    assertHolidayWritable(scope, found)
    assertRowVersion(found, rowVersion, '휴일을 찾을 수 없습니다.')
    const owner = await ownerOf(tx, data.centerId, scope)
    const fields = fieldsOf(data)
    await assertDateFree(tx, owner, fields.holidayOn, id)
    return withVersionGuard(() =>
      tx.operatorHoliday.update({
        where: { id, rowVersion },
        data: { ...fields, centerId: owner.centerId },
        select: { id: true, rowVersion: true },
      }),
    )
  })
}

// 여러 건 고르기: 모두 고칠 수 있는 범위 (deleted: 지운 것을 고를 때)
export async function assertHolidaysWritable(ids: bigint[], scope: DataScope, deleted = false) {
  const rows = await prisma.operatorHoliday.findMany({
    where: { id: { in: ids }, ...(deleted ? DELETED_ONLY : {}) },
    select: { id: true, operatorId: true, centerId: true },
  })
  if (rows.length !== ids.length) {
    throw new ActionError(
      'NOT_FOUND',
      '찾을 수 없는 휴일이 섞여 있습니다. 목록을 새로 고쳐 주세요.',
    )
  }
  for (const row of rows) assertHolidayWritable(scope, row)
}

// 지우기 (되살릴 수 있다)
export async function deleteOperatorHolidays(ids: bigint[]) {
  const { count } = await prisma.operatorHoliday.updateMany({
    where: { id: { in: ids } },
    data: DELETED_ONLY,
  })
  return { count }
}

// 되살리기: 그 사이 같은 범위·같은 날짜에 다른 휴일을 등록했으면 거부
export async function restoreOperatorHolidays(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.operatorHoliday.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { operatorId: true, centerId: true, holidayOn: true },
    })
    assertAllFound(rows.length, ids.length, '휴일')
    // 되살릴 것끼리도 겹치면 안 된다
    const keys = rows.map((r) => `${r.centerId ?? `op${r.operatorId}`}|${textOf(r.holidayOn)}`)
    if (new Set(keys).size !== keys.length) {
      throw new ActionError('CONFLICT', '같은 범위·같은 날짜의 휴일을 함께 되살릴 수 없습니다.')
    }
    for (const row of rows) await assertDateFree(tx, row, row.holidayOn)
    const { count } = await tx.operatorHoliday.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
