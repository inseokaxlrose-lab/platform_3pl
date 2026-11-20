import 'server-only'
import { z } from 'zod'
import {
  itemErrorOf,
  apiCustomerSchema,
  apiShipToSchema,
  upsertCustomer,
  type CustomerItem,
} from '@/lib/customers/customer-upsert'
import type { ShipToSaveResult } from '@/lib/customers/customers'
import type { ShipToCenterPolicy } from '@/lib/customers/ship-to-center'
import { keyWhere, shipperIfKeyType, type IfKeyType } from '@/lib/master-code/if-key'
import { prisma } from '@/lib/prisma'
import { NOT_DELETED } from '@/lib/status'
import { isYes } from '@/lib/yn'
import { ApiError } from '../api-errors'
import {
  readItems,
  writeTransaction,
  type ApiHandlerContext,
  type ApiHandlerResult,
} from '../api-route'

// 거래처 API (docs/decisions/0082 ③, 정의서 7번) — 화면의 "거래처"를 연동에서는 customer라고 부른다 (필드 대응: docs/api-customer-fields.md)
//   POST /customers                       거래처 upsert (납품처 포함 가능)
//   GET  /customers                       목록 (updatedAfter·cursor)
//   GET  /customers/{customerCd}           상세 (납품처 포함)
//   POST /customers/{customerCd}/ship-tos  납품처 upsert
//   GET  /customers/{customerCd}/ship-tos  납품처 목록
// 등록은 건마다 따로 저장한다 (한 건 실패가 다른 건을 되돌리지 않게). TEST 키는 건마다 계산만 하고 되돌린다

type ItemResult = Extract<ApiHandlerResult, { items: unknown }>['items'][number]

// 배송센터 확인 사유(내부) → API 오류코드
const API_REASON: Record<string, string> = { ADDR_NOT_RESOLVED: 'ADDRESS_NOT_RESOLVED' }

// 납품처 한 곳의 결과 (응답 shipTos[])
function shipToResult(r: ShipToSaveResult) {
  return {
    shipToCd: r.code,
    shipToCustCd: r.custCode ?? null,
    result: r.result,
    ...(r.result === 'FAIL'
      ? {
          errors: [
            {
              code: API_REASON[r.error?.code ?? ''] ?? r.error?.code ?? 'VALIDATION_FAILED',
              message: r.error?.message ?? '',
            },
          ],
        }
      : r.centerAssignStatus
        ? {
            addrGrade: r.addressGrade ?? null,
            zipCd: r.zipCode ?? null,
            centerCd: r.centerCode ?? null,
            centerAssignType: r.centerAssignType ?? null,
            centerAssignStatus: r.centerAssignStatus,
            ...(r.centerAssignStatus === 'NEED_CONFIRM' && {
              confirmReason: r.centerConfirmReason ?? null,
            }),
            regionMismatch: r.regionMismatch ?? false,
          }
        : {}),
  }
}

// 화주 설정: 배송센터 정책 + 연동 조회 키 (0084 — CODE면 customerCd·shipToCd, CUST_CD면 customerCustCd·shipToCustCd)
async function settingsOf(shipperId: bigint) {
  const shipper = await prisma.shipper.findUniqueOrThrow({
    where: { id: shipperId },
    select: { shipToCenterPolicy: true, ifKeyType: true },
  })
  return {
    policy: shipper.shipToCenterPolicy as ShipToCenterPolicy,
    keyType: (shipper.ifKeyType === 'CUST_CD' ? 'CUST_CD' : 'CODE') as IfKeyType,
  }
}
type Settings = Awaited<ReturnType<typeof settingsOf>>

// 키 정리: 우리 코드는 대문자로, 사용자 정의 코드는 화주 시스템 값 그대로 (앞뒤 공백만 뺀다)
const keyOf = (keyType: IfKeyType, value: string) =>
  keyType === 'CUST_CD' ? value.trim() : value.trim().toUpperCase()
const keyNames = (keyType: IfKeyType) =>
  keyType === 'CUST_CD'
    ? { customer: 'customerCustCd', shipTo: 'shipToCustCd' }
    : { customer: 'customerCd', shipTo: 'shipToCd' }
const rawKey = (raw: unknown, name: string) => {
  const value = (raw as Record<string, unknown> | null)?.[name]
  return typeof value === 'string' ? value : null
}

// 건 하나 처리: 입력 규칙 → 저장(건마다 트랜잭션) → 결과. 업무 오류는 그 건만 FAIL
async function upsertOne(
  ctx: ApiHandlerContext,
  seq: number,
  input: CustomerItem,
  settings: Settings,
) {
  try {
    return {
      ok: true as const,
      value: await writeTransaction(ctx, (tx) =>
        upsertCustomer(tx, input, {
          shipperId: ctx.api.shipperId,
          source: 'API',
          policy: settings.policy,
          keyType: settings.keyType,
          requestId: ctx.requestId,
        }),
      ),
    }
  } catch (error) {
    const itemError = itemErrorOf(error)
    if (!itemError) throw error
    return {
      ok: false as const,
      error: { code: itemError.code, message: itemError.message, field: itemError.field },
      seq,
    }
  }
}

const fail = (
  seq: number,
  docNo: string | null,
  error: { code: string; message: string; field?: string },
): ItemResult => ({
  seq,
  docNo,
  result: 'FAIL',
  errors: [error],
})

// 입력 규칙 오류 → 건별 오류 (field = 연동 이름 경로)
const validationError = (error: z.ZodError) => {
  const issue = error.issues[0]
  return {
    code: 'VALIDATION_FAILED',
    message: issue?.message ?? '입력값을 확인해 주세요.',
    field: issue?.path.join('.') || undefined,
  }
}

// POST /customers
export async function postCustomers(ctx: ApiHandlerContext): Promise<ApiHandlerResult> {
  const list = readItems(ctx.body)
  const settings = await settingsOf(ctx.api.shipperId)
  const names = keyNames(settings.keyType)
  const items: ItemResult[] = []
  for (const [index, raw] of list.entries()) {
    const seq = index + 1
    const sentKey = rawKey(raw, names.customer)
    const docNo = sentKey === null ? null : keyOf(settings.keyType, sentKey)
    const parsed = apiCustomerSchema.safeParse(raw)
    if (!parsed.success) {
      items.push(fail(seq, docNo, validationError(parsed.error)))
      continue
    }
    const done = await upsertOne(ctx, seq, parsed.data, settings)
    if (!done.ok) {
      items.push(fail(seq, docNo, done.error))
      continue
    }
    items.push({
      seq,
      docNo,
      result: done.value.result,
      internalId: done.value.id,
      extra: {
        customerCd: done.value.code,
        customerCustCd: done.value.custCode,
        shipTos: done.value.shipTos.map(shipToResult),
      },
    })
  }
  return { items }
}

// POST /customers/{customerCd}/ship-tos — 건 하나 = 납품처 하나
export async function postShipTos(ctx: ApiHandlerContext): Promise<ApiHandlerResult> {
  const settings = await settingsOf(ctx.api.shipperId)
  const names = keyNames(settings.keyType)
  // 경로 값은 거래처 조회 키 (customerCd 또는 customerCustCd)
  const customerKey = keyOf(settings.keyType, ctx.params.customerCd ?? '')
  const list = readItems(ctx.body)
  await findCustomer(ctx.api.shipperId, settings.keyType, customerKey)
  const items: ItemResult[] = []
  for (const [index, raw] of list.entries()) {
    const seq = index + 1
    const sentKey = rawKey(raw, names.shipTo)
    const docNo = sentKey === null ? null : keyOf(settings.keyType, sentKey)
    const parsed = apiShipToSchema.safeParse(raw)
    if (!parsed.success) {
      items.push(fail(seq, docNo, validationError(parsed.error)))
      continue
    }
    const done = await upsertOne(
      ctx,
      seq,
      { [names.customer]: customerKey, shipTos: [parsed.data] },
      settings,
    )
    if (!done.ok) {
      items.push(fail(seq, docNo, done.error))
      continue
    }
    const shipTo = done.value.shipTos[0]
    const shown = shipToResult(shipTo)
    if (shipTo.result === 'FAIL') {
      items.push(
        fail(seq, docNo, (shown as { errors: { code: string; message: string }[] }).errors[0]),
      )
      continue
    }
    const { result, ...detail } = shown
    items.push({ seq, docNo, result, extra: detail })
  }
  return { items }
}

// ── 조회 ──

const CUSTOMER_SELECT = {
  id: true,
  code: true,
  custCode: true,
  name: true,
  shortName: true,
  customerType: true,
  customerGroup: true,
  businessNumber: true,
  ceoName: true,
  orderAddrMode: true,
  phone: true,
  fax: true,
  email: true,
  rawZipCode: true,
  rawAddress: true,
  zipCode: true,
  address: true,
  addressDetail: true,
  addressGrade: true,
  minShelfDays: true,
  minShelfRatio: true,
  status: true,
  source: true,
  remark: true,
  lastIfAt: true,
  updatedAt: true,
} as const

type CustomerRow = {
  code: string
  custCode: string | null
  name: string
  shortName: string | null
  customerType: string | null
  customerGroup: string | null
  businessNumber: string | null
  ceoName: string | null
  orderAddrMode: string
  phone: string | null
  fax: string | null
  email: string | null
  rawZipCode: string | null
  rawAddress: string | null
  zipCode: string | null
  address: string | null
  addressDetail: string | null
  addressGrade: string | null
  minShelfDays: number | null
  minShelfRatio: { toString(): string } | null
  status: string
  source: string
  remark: string | null
  lastIfAt: Date | null
  updatedAt: Date
}

const toCustomer = (c: CustomerRow) => ({
  customerCd: c.code,
  customerCustCd: c.custCode,
  customerNm: c.name,
  shortNm: c.shortName,
  customerType: c.customerType,
  customerGroup: c.customerGroup,
  bizRegNo: c.businessNumber,
  ceoNm: c.ceoName,
  orderAddrMode: c.orderAddrMode,
  telNo: c.phone,
  faxNo: c.fax,
  email: c.email,
  zipCd: c.rawZipCode ?? c.zipCode,
  addr1: c.rawAddress ?? c.address,
  addr2: c.addressDetail,
  addrGrade: c.addressGrade,
  minShelfDays: c.minShelfDays,
  minShelfRatio: c.minShelfRatio === null ? null : Number(c.minShelfRatio.toString()),
  status: c.status,
  source: c.source,
  remark: c.remark,
  lastIfAt: c.lastIfAt?.toISOString() ?? null,
  updatedAt: c.updatedAt.toISOString(),
})

const SHIP_TO_SELECT = {
  code: true,
  custCode: true,
  name: true,
  isDefault: true,
  addrSyncYn: true,
  status: true,
  rawZipCode: true,
  rawAddress: true,
  addressDetail: true,
  zipCode: true,
  address: true,
  addressGrade: true,
  receiverName: true,
  receiverPhone: true,
  receiverPhone2: true,
  deliveryMemo: true,
  centerAssignType: true,
  centerAssignStatus: true,
  centerConfirmReason: true,
  regionMismatchYn: true,
  remark: true,
  updatedAt: true,
  deliveryCenter: { select: { code: true } },
} as const

type ShipToRow = {
  code: string
  custCode: string | null
  name: string
  isDefault: string
  addrSyncYn: string
  status: string
  rawZipCode: string | null
  rawAddress: string
  addressDetail: string | null
  zipCode: string | null
  address: string
  addressGrade: string
  receiverName: string | null
  receiverPhone: string | null
  receiverPhone2: string | null
  deliveryMemo: string | null
  centerAssignType: string | null
  centerAssignStatus: string
  centerConfirmReason: string | null
  regionMismatchYn: string
  remark: string | null
  updatedAt: Date
  deliveryCenter: { code: string } | null
}

const toShipTo = (s: ShipToRow) => ({
  shipToCd: s.code,
  shipToCustCd: s.custCode,
  shipToNm: s.name,
  default: isYes(s.isDefault),
  addrSync: isYes(s.addrSyncYn),
  status: s.status,
  zipCd: s.rawZipCode,
  addr1: s.rawAddress,
  addr2: s.addressDetail,
  // 정제 결과 (읽기 전용)
  refinedZipCd: s.zipCode,
  refinedAddr: s.address,
  addrGrade: s.addressGrade,
  receiverNm: s.receiverName,
  receiverTelNo: s.receiverPhone,
  receiverTelNo2: s.receiverPhone2,
  deliveryMemo: s.deliveryMemo,
  centerCd: s.deliveryCenter?.code ?? null,
  centerAssignType: s.centerAssignType,
  centerAssignStatus: s.centerAssignStatus,
  confirmReason: s.centerConfirmReason,
  regionMismatch: isYes(s.regionMismatchYn),
  remark: s.remark,
  updatedAt: s.updatedAt.toISOString(),
})

// 거래처 찾기 (key는 keyOf로 정리한 조회 키)
async function findCustomer(shipperId: bigint, keyType: IfKeyType, key: string) {
  const found = await prisma.customer.findFirst({
    where: { shipperId, ...keyWhere(keyType, key) },
    select: { id: true },
  })
  if (!found) throw new ApiError('NOT_FOUND', { message: `없는 거래처입니다: ${key}` })
  return found
}

// 경로 값 → 거래처 (화주 연동 조회 키로)
async function customerOfPath(ctx: ApiHandlerContext) {
  const keyType = await shipperIfKeyType(prisma, ctx.api.shipperId)
  return findCustomer(ctx.api.shipperId, keyType, keyOf(keyType, ctx.params.customerCd ?? ''))
}

// GET /customers?updatedAfter=ISO&cursor=…&limit=100 — 수정일시 오래된 순, 다음 쪽은 nextCursor로
export const listQuerySchema = z.object({
  updatedAfter: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().regex(/^\d+$/, 'cursor는 이전 응답의 nextCursor입니다.').optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export async function getCustomers(ctx: ApiHandlerContext) {
  const url = new URL(ctx.request.url)
  const query = listQuerySchema.parse(Object.fromEntries(url.searchParams))
  const rows = await prisma.customer.findMany({
    where: {
      shipperId: ctx.api.shipperId,
      ...(query.updatedAfter && { updatedAt: { gt: new Date(query.updatedAfter) } }),
      ...(query.cursor && { id: { gt: BigInt(query.cursor) } }),
    },
    select: { ...CUSTOMER_SELECT, _count: { select: { shipTos: { where: NOT_DELETED } } } },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  })
  const page = rows.slice(0, query.limit)
  return {
    items: page.map(({ _count, ...c }) => ({ ...toCustomer(c), shipToCount: _count.shipTos })),
    nextCursor: rows.length > query.limit ? String(page[page.length - 1].id) : null,
  }
}

// GET /customers/{customerCd}
export async function getCustomer(ctx: ApiHandlerContext) {
  const { id } = await customerOfPath(ctx)
  const row = await prisma.customer.findUniqueOrThrow({
    where: { id },
    select: {
      ...CUSTOMER_SELECT,
      shipTos: {
        where: NOT_DELETED,
        select: SHIP_TO_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
    },
  })
  const { shipTos, ...customer } = row
  return { ...toCustomer(customer), shipTos: shipTos.map(toShipTo) }
}

// GET /customers/{customerCd}/ship-tos
export async function getShipTos(ctx: ApiHandlerContext) {
  const { id } = await customerOfPath(ctx)
  const shipTos = await prisma.shipTo.findMany({
    where: { customerId: id, ...NOT_DELETED },
    select: SHIP_TO_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  return { items: shipTos.map(toShipTo) }
}
