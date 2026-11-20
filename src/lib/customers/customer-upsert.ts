import 'server-only'
import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { keyWhere, type IfKeyType } from '@/lib/master-code/if-key'
import type { Db } from '@/lib/prisma'
import type { AddressSearcher } from '@/lib/regions/juso-client'
import { NOT_DELETED } from '@/lib/status'
import { CUSTOMER_STATUS, ORDER_ADDR_MODE, SHIP_TO_STATUS } from './customer-codes'
import { customerInputOf } from './customer-queries'
import {
  customerCreateSchema,
  customerSchema,
  EMPTY_SHIP_TO,
  type CustomerInput,
  type ShipToInput,
} from './customer-schema'
import { createCustomerIn, updateCustomerIn, type ShipToSaveResult } from './customers'
import type { ShipToCenterPolicy } from './ship-to-center'

// 거래처 upsert — 연동 API(POST /customers)와 엑셀 업로드가 같이 쓴다 (docs/decisions/0082 ③, 정의서 7번 "처리 규칙")
// - 업무 키: 화주 연동 조회 키(0084)에 따라 CODE면 customerCd·shipToCd, CUST_CD면 customerCustCd·shipToCustCd
//   우리 코드(customerCd·shipToCd)는 비우면 자동 체번, 바꿀 수 없다
// - 있으면 **보낸 칸만** 고친다 (안 보낸 칸은 그대로, null은 값 지우기)
// - shipTos는 **보낸 납품처만** 추가·수정한다 (빠진 납품처는 그대로, 사용 중지는 status=INACTIVE)
// - 새 거래처에 shipTos가 없으면 거래처 주소로 기본 납품처 (주소도 없으면 CUSTOMER_ADDRESS_REQUIRED)
// - 배송센터: centerCd가 있으면 그 센터(IF), null이면 권역 자동, 안 보내면 지금 지정 그대로
//   화주 정책으로 반려된 납품처만 FAIL. 그 때문에 기본 납품처가 없어지는 새 거래처는 거래처도 FAIL
// - 바뀐 것이 없으면 UNCHANGED (아무것도 쓰지 않는다 — 수정일 그대로)

// ── 연동 필드 (camelCase, 화면 칸과의 대응은 docs/api-customer-fields.md)

const text = (max: number) => z.string().max(max).nullable().optional()

export const apiShipToSchema = z.object({
  // 찾는 키는 화주 연동 조회 키에 따라 shipToCd 또는 shipToCustCd (필수 검사는 upsert에서)
  shipToCd: z.string().trim().max(40).optional(),
  shipToCustCd: text(50),
  shipToNm: text(100),
  default: z.boolean().optional().describe('기본 납품처 (거래처당 1곳)'),
  addrSync: z.boolean().optional().describe('기본 납품처 주소를 거래처 주소와 함께 바꿈'),
  zipCd: text(10),
  addr1: text(200),
  addr2: text(200),
  receiverNm: text(50),
  receiverTelNo: text(20),
  receiverTelNo2: text(20),
  deliveryMemo: text(200),
  centerCd: text(20).describe('배송센터코드 (null = 권역 자동, 안 보내면 지금 지정 유지)'),
  status: z.enum(SHIP_TO_STATUS.values).optional(),
  remark: text(1000),
})

export const apiCustomerSchema = z.object({
  // 찾는 키는 화주 연동 조회 키에 따라 customerCd 또는 customerCustCd (필수 검사는 upsert에서)
  customerCd: z.string().trim().max(30).optional(),
  customerCustCd: text(50),
  customerNm: text(200),
  shortNm: text(30),
  customerType: text(20).describe('공통코드 CUSTOMER_TYPE'),
  customerGroup: text(30),
  bizRegNo: text(20),
  ceoNm: text(50),
  orderAddrMode: z.enum(ORDER_ADDR_MODE.values).optional(),
  telNo: text(20),
  faxNo: text(20),
  email: text(100),
  zipCd: text(10),
  addr1: text(200),
  addr2: text(200),
  minShelfDays: z.number().int().nullable().optional(),
  minShelfRatio: z.union([z.number(), z.string()]).nullable().optional(),
  status: z.enum(CUSTOMER_STATUS.values).optional(),
  remark: text(1000),
  shipTos: z.array(apiShipToSchema).max(200).optional(),
})

export type CustomerItem = z.infer<typeof apiCustomerSchema>
export type CustomerShipToItem = z.infer<typeof apiShipToSchema>

// 연동 필드 → 화면 입력 칸 (오류의 field를 연동 이름으로 돌려줄 때도 쓴다)
const CUSTOMER_FIELDS = {
  customerCustCd: 'custCode',
  customerNm: 'name',
  shortNm: 'shortName',
  customerType: 'customerType',
  customerGroup: 'customerGroup',
  bizRegNo: 'businessNumber',
  ceoNm: 'ceoName',
  orderAddrMode: 'orderAddrMode',
  telNo: 'phone',
  faxNo: 'fax',
  email: 'email',
  zipCd: 'zipCode',
  addr1: 'address',
  addr2: 'addressDetail',
  remark: 'remark',
} as const satisfies Partial<Record<keyof CustomerItem, keyof CustomerInput>>

const SHIP_TO_FIELDS = {
  shipToCustCd: 'custCode',
  shipToNm: 'name',
  zipCd: 'zipCode',
  addr1: 'address',
  addr2: 'addressDetail',
  receiverNm: 'receiverName',
  receiverTelNo: 'receiverPhone',
  receiverTelNo2: 'receiverPhone2',
  deliveryMemo: 'deliveryMemo',
  remark: 'remark',
} as const satisfies Partial<Record<keyof CustomerShipToItem, keyof ShipToInput>>

const reverse = (map: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(map).map(([api, field]) => [field, api]))
const CUSTOMER_FIELD_OF: Record<string, string> = {
  ...reverse(CUSTOMER_FIELDS),
  code: 'customerCd',
  minShelfDays: 'minShelfDays',
  minShelfRatio: 'minShelfRatio',
}
const SHIP_TO_FIELD_OF: Record<string, string> = {
  ...reverse(SHIP_TO_FIELDS),
  code: 'shipToCd',
  centerCode: 'centerCd',
}

// 건별 오류 (API 응답 errors[] — code는 api-errors.ts 카탈로그)
export class CustomerItemError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

// 입력 규칙 오류(Zod) → 연동 오류코드·필드
function toItemError(error: z.ZodError, sentShipTos: string[]): CustomerItemError {
  const issue = error.issues[0]
  const params = (issue as { params?: { apiCode?: string } }).params
  const [head, index, leaf] = issue.path as (string | number)[]
  if (head === 'shipTos' && typeof index === 'number') {
    const field = `shipTos[${index}].${SHIP_TO_FIELD_OF[String(leaf)] ?? String(leaf)}`
    if (leaf === 'code') return new CustomerItemError('SHIP_TO_CD_INVALID', issue.message, field)
    return new CustomerItemError(
      params?.apiCode ?? 'VALIDATION_FAILED',
      `${sentShipTos[index] ?? ''} ${issue.message}`.trim(),
      field,
    )
  }
  if (head === 'code')
    return new CustomerItemError('CUSTOMER_CD_INVALID', issue.message, 'customerCd')
  return new CustomerItemError(
    params?.apiCode ?? 'VALIDATION_FAILED',
    issue.message,
    head === 'shipTos'
      ? 'shipTos'
      : (CUSTOMER_FIELD_OF[String(head)] ?? (head ? String(head) : undefined)),
  )
}

// 보낸 칸만 덮어쓰기: undefined = 안 보냄(그대로), null = 지우기('')
const patch = <T extends Record<string, unknown>>(
  base: T,
  item: Record<string, unknown>,
  fields: Record<string, keyof T>,
) => {
  const next = { ...base }
  for (const [api, field] of Object.entries(fields)) {
    const value = item[api]
    if (value !== undefined) next[field] = (value ?? '') as T[keyof T]
  }
  return next
}

// 주소를 보냈고 지금 값과 다른지 (같은 주소를 다시 보내면 법정동·동기화를 건드리지 않는다)
const addressChanged = (
  item: { zipCd?: string | null; addr1?: string | null; addr2?: string | null },
  base: { zipCode?: string | null; address?: string | null; addressDetail?: string | null },
) =>
  (
    [
      ['zipCd', 'zipCode'],
      ['addr1', 'address'],
      ['addr2', 'addressDetail'],
    ] as const
  ).some(
    ([api, field]) =>
      item[api] !== undefined && (item[api] ?? '').trim() !== (base[field] ?? '').trim(),
  )

// ifCenterCode: 지금 연동(IF)으로 지정된 센터코드 (같은 centerCd를 다시 보내면 그대로 둔다)
function mergeShipTo(
  existing: ShipToInput | undefined,
  item: CustomerShipToItem,
  ifCenterCode: string | null,
): ShipToInput {
  const base: ShipToInput = existing ?? {
    ...EMPTY_SHIP_TO,
    // 비우면 저장할 때 자동 체번 ({거래처코드}-01 …)
    code: (item.shipToCd ?? '').toUpperCase(),
  }
  const moved = !existing || addressChanged(item, base)
  const next = patch(base, item, SHIP_TO_FIELDS)
  if (item.default !== undefined) next.isDefault = item.default
  if (item.addrSync !== undefined) next.addrSync = item.addrSync
  if (item.status !== undefined) next.status = item.status
  // 주소를 바꿨으면 동기화를 끄고(직접 주소) 법정동은 다시 찾게 비운다
  if (existing && moved) {
    next.regionCode = ''
    if (item.addrSync === undefined) next.addrSync = false
  }
  const sameIfCenter =
    typeof item.centerCd === 'string' &&
    ifCenterCode !== null &&
    item.centerCd.trim().toUpperCase() === ifCenterCode.toUpperCase()
  if (item.centerCd !== undefined && !sameIfCenter) {
    if (item.centerCd === null || item.centerCd.trim() === '') {
      Object.assign(next, { centerMode: 'AUTO', deliveryCenterId: '', centerCode: undefined })
    } else {
      Object.assign(next, {
        centerMode: 'IF',
        deliveryCenterId: '',
        centerCode: item.centerCd.trim().toUpperCase(),
      })
    }
  }
  return next
}

// 비교용: 입력값을 순서·빈 값 차이 없이 (같으면 UNCHANGED)
const plain = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? String(v) : v))
const same = (a: unknown, b: unknown) => plain(a) === plain(b)

export type UpsertOptions = {
  shipperId: bigint
  // 화주 연동 조회 키 (if-key.ts의 shipperIfKeyType) — 안 주면 CODE
  keyType?: IfKeyType
  source: 'API' | 'UPLOAD'
  policy?: ShipToCenterPolicy
  requestId?: string
  searcher?: AddressSearcher
}

export type CustomerUpsertResult = {
  result: 'CREATED' | 'UPDATED' | 'UNCHANGED'
  id: bigint
  // 우리 코드 (자동 체번이면 새로 붙은 코드)·사용자 정의 코드
  code: string
  custCode: string | null
  shipTos: ShipToSaveResult[]
}

// 찾는 키 이름·값 (CODE: 우리 코드는 대문자로, CUST_CD: 화주 시스템 값 그대로)
const KEY_NAMES = {
  CODE: { customer: 'customerCd', shipTo: 'shipToCd' },
  CUST_CD: { customer: 'customerCustCd', shipTo: 'shipToCustCd' },
} as const
const customerKeyOf = (keyType: IfKeyType, raw: CustomerItem) =>
  keyType === 'CUST_CD'
    ? (raw.customerCustCd ?? '').trim()
    : (raw.customerCd ?? '').trim().toUpperCase()
const shipToKeyOf = (keyType: IfKeyType, item: CustomerShipToItem) =>
  keyType === 'CUST_CD'
    ? (item.shipToCustCd ?? '').trim()
    : (item.shipToCd ?? '').trim().toUpperCase()
const shipToKeyIn = (keyType: IfKeyType, row: ShipToInput) =>
  keyType === 'CUST_CD' ? row.custCode : row.code

// 거래처 한 건 upsert (부르는 쪽 트랜잭션 안 — API는 건마다 트랜잭션, 업로드는 파일 하나)
export async function upsertCustomer(
  db: Db,
  raw: CustomerItem,
  options: UpsertOptions,
): Promise<CustomerUpsertResult> {
  const keyType = options.keyType ?? 'CODE'
  const names = KEY_NAMES[keyType]
  const key = customerKeyOf(keyType, raw)
  if (!key) {
    throw new CustomerItemError(
      'CUSTOMER_CD_INVALID',
      `${names.customer}를 보내 주세요 (이 화주사의 거래처 조회 키).`,
      names.customer,
    )
  }
  // 보낸 납품처의 키 (빠졌거나 두 번 있으면 오류)
  const sentKeys = (raw.shipTos ?? []).map((s) => shipToKeyOf(keyType, s))
  const missing = sentKeys.findIndex((k) => !k)
  if (missing >= 0) {
    throw new CustomerItemError(
      'SHIP_TO_CD_INVALID',
      `${names.shipTo}를 보내 주세요 (이 화주사의 납품처 조회 키).`,
      `shipTos[${missing}].${names.shipTo}`,
    )
  }
  if (new Set(sentKeys).size !== sentKeys.length) {
    throw new CustomerItemError(
      'SHIP_TO_CD_INVALID',
      `같은 ${names.shipTo}가 두 번 있습니다.`,
      'shipTos',
    )
  }
  const found = await db.customer.findFirst({
    where: { shipperId: options.shipperId, ...keyWhere(keyType, key) },
    include: {
      contacts: { orderBy: { sortOrder: 'asc' } },
      shipTos: {
        where: NOT_DELETED,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { deliveryCenter: { select: { code: true } } },
      },
    },
  })
  const ifCenterOf = new Map(
    (found?.shipTos ?? [])
      .filter((s) => s.centerAssignType === 'IF' && s.deliveryCenter)
      .map((s) => [s.code, s.deliveryCenter!.code]),
  )
  // CUST_CD 키로 찾은 거래처에 다른 우리 코드를 보내면 거부 (우리 코드는 바꿀 수 없다)
  const sentCode = (raw.customerCd ?? '').trim().toUpperCase()
  if (found && keyType === 'CUST_CD' && sentCode && sentCode !== found.code) {
    throw new CustomerItemError(
      'CUSTOMER_CD_INVALID',
      `거래처코드는 바꿀 수 없습니다 (지금 ${found.code}).`,
      'customerCd',
    )
  }
  const before = found ? customerInputOf(found) : null
  const base: CustomerInput = before ?? {
    ...customerSchemaDefaults(),
  }
  const merged: CustomerInput = patch(base, raw, CUSTOMER_FIELDS)
  // 찾는 키는 바뀌지 않는다
  if (keyType === 'CUST_CD') merged.custCode = key
  if (raw.minShelfDays !== undefined) merged.minShelfDays = raw.minShelfDays
  if (raw.minShelfRatio !== undefined)
    merged.minShelfRatio = raw.minShelfRatio === null ? '' : String(raw.minShelfRatio)
  if (before && addressChanged(raw, before)) {
    merged.regionCode = ''
    merged.addressJibun = ''
  }

  // 납품처: 기존 목록에 보낸 것만 덮어쓰고 새 것은 뒤에 (sentRows = 보낸 순서의 결과 행)
  const shipTos = [...base.shipTos]
  const sentRows: ShipToInput[] = []
  for (const [i, item] of (raw.shipTos ?? []).entries()) {
    const index = shipTos.findIndex((s) => shipToKeyIn(keyType, s) === sentKeys[i])
    const existing = index >= 0 ? shipTos[index] : undefined
    const sentShipToCode = (item.shipToCd ?? '').trim().toUpperCase()
    if (existing && keyType === 'CUST_CD' && sentShipToCode && sentShipToCode !== existing.code) {
      throw new CustomerItemError(
        'SHIP_TO_CD_INVALID',
        `납품처코드는 바꿀 수 없습니다 (지금 ${existing.code}).`,
        `shipTos[${i}].shipToCd`,
      )
    }
    const next = mergeShipTo(
      existing,
      item,
      existing ? (ifCenterOf.get(existing.code) ?? null) : null,
    )
    if (keyType === 'CUST_CD') next.custCode = sentKeys[i]
    if (index >= 0) shipTos[index] = next
    else shipTos.push(next)
    sentRows.push(next)
  }
  // 기본으로 보낸 납품처가 있으면 나머지는 기본 해제. 새 거래처인데 기본 표시가 없으면 첫 사용 중 납품처를 기본으로
  const flagged = sentRows.filter((_, i) => raw.shipTos?.[i]?.default === true)
  if (flagged.length === 1) {
    for (const s of shipTos) s.isDefault = s === flagged[0]
  } else if (!found && shipTos.length > 0 && !shipTos.some((s) => s.isDefault)) {
    const first = shipTos.find((s) => s.status === 'ACTIVE') ?? shipTos[0]
    first.isDefault = true
  }
  merged.shipTos = shipTos

  const statusChange = raw.status !== undefined && found && found.status !== raw.status
  // 비교는 입력 규칙을 거친 값으로 (02-555-1234와 저장된 0255551234는 같다)
  const normalized = (input: CustomerInput) => {
    const parsed = customerSchema.safeParse(input)
    return parsed.success ? parsed.data : input
  }
  if (found && before && same(normalized(before), normalized(merged)) && !statusChange) {
    return {
      result: 'UNCHANGED',
      id: found.id,
      code: found.code,
      custCode: found.custCode,
      shipTos: sentRows.map((s) => ({
        code: s.code,
        custCode: s.custCode || null,
        result: 'UNCHANGED' as const,
      })),
    }
  }

  const saveOptions = {
    source: options.source,
    policy: options.policy,
    requestId: options.requestId,
    searcher: options.searcher,
    partial: true,
    collectRejects: true,
  }
  let id: bigint
  let results: ShipToSaveResult[]
  if (!found) {
    const parsed = customerCreateSchema.safeParse({
      ...merged,
      shipperId: String(options.shipperId),
      // CODE 키면 키가 거래처코드, CUST_CD 키면 함께 보낸 거래처코드 (비우면 자동 체번)
      code: keyType === 'CODE' ? key : sentCode,
    })
    if (!parsed.success) throw toItemError(parsed.error, sentKeys)
    const created = await createCustomerIn(db, parsed.data, saveOptions)
    id = created.id
    results = created.shipTos
    if (raw.status === 'SUSPENDED')
      await db.customer.update({ where: { id }, data: { status: 'SUSPENDED' } })
  } else {
    const parsed = customerSchema.safeParse(merged)
    if (!parsed.success) throw toItemError(parsed.error, sentKeys)
    const updated = await updateCustomerIn(db, found.id, found.rowVersion, parsed.data, saveOptions)
    id = found.id
    results = updated.shipTos
    if (statusChange) await db.customer.update({ where: { id }, data: { status: raw.status } })
  }
  // 반려 때문에 기본 납품처가 없어졌으면 거래처도 실패 (새 거래처의 유일한 납품처가 반려된 경우 등)
  const hasDefault = await db.shipTo.count({
    where: { customerId: id, isDefault: 'Y', ...NOT_DELETED },
  })
  if (hasDefault === 0) {
    const rejected = results.find((r) => r.result === 'FAIL')
    throw new CustomerItemError(
      rejected?.error?.code ?? 'DEFAULT_SHIP_TO_REQUIRED',
      `기본 납품처를 저장하지 못했습니다${rejected ? ` (${rejected.code}: ${rejected.error?.message})` : ''}.`,
      'shipTos',
    )
  }
  // 저장된 코드 (자동 체번 결과 포함)
  const saved = await db.customer.findUniqueOrThrow({
    where: { id },
    select: { code: true, custCode: true },
  })
  // 응답에는 보낸 납품처(보낸 것이 없으면 자동으로 만든 기본 납품처)만 — 보낸 키로 짝짓는다
  const keyOfResult = (r: ShipToSaveResult) => (keyType === 'CUST_CD' ? (r.custCode ?? '') : r.code)
  const shown =
    sentKeys.length > 0
      ? results.filter((r) => sentKeys.includes(keyOfResult(r)))
      : found
        ? []
        : results
  return {
    result: found ? 'UPDATED' : 'CREATED',
    id,
    code: saved.code,
    custCode: saved.custCode,
    shipTos: shown.map((r) => ({ ...r, custCode: r.custCode ?? null })),
  }
}

// 새 거래처의 빈 입력값 (화면 등록 화면의 빈 양식과 같은 모양)
function customerSchemaDefaults(): CustomerInput {
  return {
    custCode: '',
    name: '',
    shortName: '',
    customerType: '',
    customerGroup: '',
    businessNumber: '',
    ceoName: '',
    orderAddrMode: 'SHIP_TO',
    phone: '',
    fax: '',
    email: '',
    zipCode: '',
    address: '',
    addressDetail: '',
    addressJibun: '',
    regionCode: '',
    minShelfDays: null,
    minShelfRatio: '',
    remark: '',
    contacts: [],
    shipTos: [],
  }
}

// 서비스 오류(ActionError) → 건별 오류코드
export function itemErrorOf(error: unknown): CustomerItemError | null {
  if (error instanceof CustomerItemError) return error
  if (error instanceof ActionError) {
    const map: Record<string, string> = {
      VALIDATION: 'VALIDATION_FAILED',
      NOT_FOUND: 'NOT_FOUND',
      CONFLICT: 'STATUS_NOT_ALLOWED',
    }
    return new CustomerItemError(map[error.code] ?? 'VALIDATION_FAILED', error.message)
  }
  return null
}
