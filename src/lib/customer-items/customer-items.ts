import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { textIds } from '@/lib/id'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertInScope, scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { assertAllFound } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, toStatus } from '@/lib/status'
import type { CustomerItemData } from './customer-item-schema'

// 거래처별 품목코드 (docs/decisions/0098): 거래처(매출처) × 품목 → 거래처의 상품코드·바코드·납품 단위
// - 거래처와 품목은 같은 화주사, 거래처는 매출처·둘 다만 (매입처는 납품하지 않는다)
// - 같은 거래처에 같은 품목은 한 줄, 거래처 품목코드는 거래처 안에서 고유 (지운 줄은 빼고)
// - 데이터 범위는 거래처와 같다 (화주사 사용자 = 자기 화주사, 센터 직원 = 소속 센터를 이용하는 화주사)

export const CUSTOMER_ITEM_SCOPE = {
  center: 'shipper.centers.some.centerId',
  shipper: 'shipperId',
}
const SCOPE_SELECT = {
  operatorId: true,
  shipperId: true,
  shipper: { select: { centers: { select: { centerId: true } } } },
} as const

// 저장 전 검사 → 화주사 키
export async function checkCustomerItem(
  db: Db,
  data: CustomerItemData,
  scope: DataScope,
  currentId?: bigint,
) {
  const customer = await db.customer.findUnique({
    where: { id: data.customerId },
    select: { ...SCOPE_SELECT, id: true, code: true, role: true },
  })
  assertInScope(scope, customer, CUSTOMER_ITEM_SCOPE)
  if (customer!.role === 'PURCHASE') {
    throw new ActionError(
      'VALIDATION',
      `거래처 ${customer!.code}는 매입처라 거래처 품목코드를 둘 수 없습니다. (매출처·둘 다만)`,
    )
  }
  const item = await db.item.findUnique({
    where: { id: data.itemId },
    select: { shipperId: true, code: true, units: { select: { unitId: true } } },
  })
  if (!item || item.shipperId !== customer!.shipperId) {
    throw new ActionError('VALIDATION', '거래처와 같은 화주사의 품목을 골라 주세요.')
  }
  if (data.deliveryUnitId !== null && !item.units.some((u) => u.unitId === data.deliveryUnitId)) {
    throw new ActionError('VALIDATION', `납품 단위는 품목 ${item.code}의 단위 중에서 골라 주세요.`)
  }
  const others = currentId === undefined ? {} : { id: { not: currentId } }
  const sameItem = await db.customerItem.findFirst({
    where: { customerId: data.customerId, itemId: data.itemId, ...others },
    select: { custItemCode: true },
  })
  if (sameItem) {
    throw new ActionError(
      'CONFLICT',
      `거래처 ${customer!.code}에 품목 ${item.code}이 이미 있습니다 (거래처 품목코드 ${sameItem.custItemCode}).`,
    )
  }
  const sameCode = await db.customerItem.findFirst({
    where: { customerId: data.customerId, custItemCode: data.custItemCode, ...others },
    select: { item: { select: { code: true } } },
  })
  if (sameCode) {
    throw new ActionError(
      'CONFLICT',
      `거래처 ${customer!.code}에서 거래처 품목코드 ${data.custItemCode}는 이미 품목 ${sameCode.item.code}이 씁니다.`,
    )
  }
  return { shipperId: customer!.shipperId }
}

const decimal = (value: string | null) => (value === null ? null : new Prisma.Decimal(value))

// DB 칸으로 옮길 값
function fieldsOf(data: CustomerItemData) {
  return {
    customerId: data.customerId,
    itemId: data.itemId,
    custItemCode: data.custItemCode,
    custItemName: data.custItemName,
    custBarcode: data.custBarcode,
    deliveryUnitId: data.deliveryUnitId,
    minShelfDays: data.minShelfDays,
    minShelfRatio: decimal(data.minShelfRatio),
    status: toStatus(data.isActive),
    remark: data.remark,
  }
}

// 등록 본체 (엑셀 업로드도 같은 트랜잭션 안에서 부른다)
export async function createCustomerItemIn(db: Db, data: CustomerItemData, scope: DataScope) {
  const { shipperId } = await checkCustomerItem(db, data, scope)
  const created = await db.customerItem.create({
    data: { ...fieldsOf(data), operatorId: requireOperatorId(), shipperId },
    select: { id: true, rowVersion: true },
  })
  return created
}

export const createCustomerItem = (data: CustomerItemData, scope: DataScope) =>
  prisma.$transaction((tx) => createCustomerItemIn(tx, data, scope))

export async function updateCustomerItemIn(
  db: Db,
  id: bigint,
  rowVersion: number,
  data: CustomerItemData,
  scope: DataScope,
) {
  const found = await db.customerItem.findUnique({
    where: { id },
    select: { ...SCOPE_SELECT, rowVersion: true },
  })
  assertRowVersion(found, rowVersion, '거래처 품목코드를 찾을 수 없습니다.')
  assertInScope(scope, found, CUSTOMER_ITEM_SCOPE)
  const { shipperId } = await checkCustomerItem(db, data, scope, id)
  return withVersionGuard(() =>
    db.customerItem.update({
      where: { id, rowVersion },
      data: { ...fieldsOf(data), shipperId },
      select: { id: true, rowVersion: true },
    }),
  )
}

export const updateCustomerItem = (
  id: bigint,
  rowVersion: number,
  data: CustomerItemData,
  scope: DataScope,
) => prisma.$transaction((tx) => updateCustomerItemIn(tx, id, rowVersion, data, scope))

// 고른 줄이 모두 범위 안이어야 한다 (하나라도 밖·없음이면 전체 거부)
export async function assertCustomerItemsInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const rows = await prisma.customerItem.findMany({
    where: { id: { in: ids }, ...(deleted ? DELETED_ONLY : {}) },
    select: { id: true, ...SCOPE_SELECT },
  })
  if (rows.length !== ids.length) {
    throw new ActionError(
      'NOT_FOUND',
      '찾을 수 없는 거래처 품목코드가 섞여 있습니다. 목록을 새로 고쳐 주세요.',
    )
  }
  for (const row of rows) assertInScope(scope, row, CUSTOMER_ITEM_SCOPE)
  return ids
}

export async function setCustomerItemsActive(ids: bigint[], isActive: boolean) {
  const { count } = await prisma.customerItem.updateMany({
    where: { id: { in: ids } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

export async function deleteCustomerItems(ids: bigint[]) {
  const { count } = await prisma.customerItem.updateMany({
    where: { id: { in: ids } },
    data: DELETED_ONLY,
  })
  return { count }
}

// 되살리기: 그 사이 같은 거래처에 같은 품목·같은 거래처 품목코드를 다시 등록했으면 거부
export async function restoreCustomerItems(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.customerItem.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { customerId: true, itemId: true, custItemCode: true },
    })
    assertAllFound(rows.length, ids.length, '거래처 품목코드')
    for (const row of rows) {
      const taken = await tx.customerItem.findFirst({
        where: {
          customerId: row.customerId,
          OR: [{ itemId: row.itemId }, { custItemCode: row.custItemCode }],
        },
        select: { custItemCode: true },
      })
      if (taken) {
        throw new ActionError(
          'CONFLICT',
          `같은 거래처에 같은 품목이나 거래처 품목코드(${taken.custItemCode})가 다시 등록되어 되살릴 수 없습니다.`,
        )
      }
    }
    const { count } = await tx.customerItem.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}

// 팝업 선택지: 그 화주사의 거래처(매출처·둘 다)와 품목(단위 포함)
export async function getCustomerItemOptions(shipperId: bigint, scope: DataScope) {
  const shipper = await prisma.shipper.findFirst({
    where: {
      AND: [
        { id: shipperId },
        scopeFilter(scope, { center: 'centers.some.centerId', shipper: 'id' }),
      ],
    },
    select: { id: true },
  })
  if (!shipper) return { customers: [], items: [] }
  const [customers, items] = await Promise.all([
    prisma.customer.findMany({
      where: { shipperId, role: { not: 'PURCHASE' } },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { code: 'asc' },
    }),
    prisma.item.findMany({
      where: { shipperId },
      select: {
        id: true,
        code: true,
        name: true,
        spec: true,
        status: true,
        units: {
          orderBy: { sortOrder: 'asc' },
          select: { unitId: true, level: true, unit: { select: { code: true } } },
        },
      },
      orderBy: { code: 'asc' },
    }),
  ])
  return textIds({
    customers,
    items: items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      spec: item.spec,
      status: item.status,
      units: item.units.map((u) => ({ id: u.unitId, code: u.unit.code, level: u.level })),
    })),
  })
}

export type CustomerItemOptions = Awaited<ReturnType<typeof getCustomerItemOptions>>
