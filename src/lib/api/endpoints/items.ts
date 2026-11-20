import 'server-only'
import type { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { apiItemSchema, type ApiItemInput } from '@/lib/items/item-api-schema'
import type { ItemWarning } from '@/lib/items/item-calc'
import type { BarcodeType, UnitLevel } from '@/lib/items/item-codes'
import { EMPTY_UNIT_ROW } from '@/lib/items/item-defaults'
import type { ItemInput } from '@/lib/items/item-schema'
import { ItemInputError, upsertItem } from '@/lib/items/item-upsert'
import { keyWhere, shipperIfKeyType, type IfKeyType } from '@/lib/master-code/if-key'
import { prisma, type Db } from '@/lib/prisma'
import { sharedOperatorFilter } from '@/lib/scope/data-scope'
import { qtyText, parseQty } from '@/lib/units/convert'
import { isYes } from '@/lib/yn'
import { ApiError } from '../api-errors'
import {
  readItems,
  writeTransaction,
  type ApiHandlerContext,
  type ApiHandlerResult,
} from '../api-route'
import { listQuerySchema } from './partners'

// 품목 API (docs/decisions/0083 ③, 정의서 7장) — 필드 대응: docs/api-item-fields.md
//   POST /items           품목 upsert (단위·팔레트·바코드 포함, 최대 500건)
//   GET  /items           목록 (updatedAfter·cursor)
//   GET  /items/{itemCd}  상세 (단위·바코드·PLT 계산값 포함)
// 저장은 엑셀 업로드와 같은 upsert 서비스 — 보낸 칸만 고치고, 같으면 UNCHANGED
// 건마다 따로 저장한다 (한 건 실패가 다른 건을 되돌리지 않게). TEST 키는 건마다 계산만 하고 되돌린다

type ItemResult = Extract<ApiHandlerResult, { items: unknown }>['items'][number]

// ── 단위 코드 → 우리 단위

type UnitResolver = (code: string) => { id: string; code: string }

// 우리 단위 코드(시스템 기본·운영사 추가)를 먼저 찾고, 없으면 외부코드 매핑(대상 '단위')에서 찾는다
// 외부 코드는 연동 상대(SAP·ERP)별로 저장되므로, 이 운영사의 매핑 중 한 단위로만 정해질 때만 쓴다
async function unitResolver(ctx: ApiHandlerContext): Promise<UnitResolver> {
  const [units, mapped] = await Promise.all([
    prisma.unit.findMany({
      where: sharedOperatorFilter(ctx.api.scope),
      select: { id: true, code: true },
    }),
    prisma.externalCode.findMany({
      where: { operatorId: ctx.api.operatorId, entityType: 'UNIT' },
      select: { code: true, entityId: true },
    }),
  ])
  const byCode = new Map(units.map((u) => [u.code.toUpperCase(), u]))
  const byId = new Map(units.map((u) => [u.id, u]))
  const external = new Map<string, Set<bigint>>()
  for (const m of mapped) {
    const key = m.code.toUpperCase()
    external.set(key, (external.get(key) ?? new Set()).add(m.entityId))
  }
  return (raw) => {
    const code = raw.trim().toUpperCase()
    const own = byCode.get(code)
    if (own) return { id: String(own.id), code: own.code }
    const ids = [...(external.get(code) ?? [])]
    const unit = ids.length === 1 ? byId.get(ids[0]) : undefined
    if (!unit) {
      throw new ActionError(
        'VALIDATION',
        ids.length > 1
          ? `단위 코드 ${raw}가 외부코드 매핑에서 여러 단위로 연결되어 있습니다.`
          : `없는 단위 코드입니다: ${raw} (우리 단위 코드나 외부코드 매핑의 단위 코드)`,
        'UOM_NOT_FOUND',
      )
    }
    return { id: String(unit.id), code: unit.code }
  }
}

// ── 보낸 칸 → 품목 입력 (안 보낸 칸은 그대로, null은 지우기)

const text = (value: string | null | undefined) => value ?? ''
const num = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '' : String(value)

// 바코드 종류를 안 보내면 숫자 자리수로 짐작 (엑셀 업로드와 같다)
function barcodeTypeOf(barcode: string): BarcodeType {
  if (!/^\d+$/.test(barcode)) return 'CUSTOM'
  return (
    ({ 8: 'EAN8', 12: 'UPCA', 13: 'EAN13', 14: 'ITF14' } as Record<number, BarcodeType>)[
      barcode.length
    ] ?? 'CUSTOM'
  )
}

function patchOf(input: ApiItemInput, resolve: UnitResolver) {
  return (current: ItemInput): ItemInput => {
    const next: ItemInput = {
      ...current,
      units: current.units.map((u) => ({ ...u })),
      barcodes: current.barcodes.map((b) => ({ ...b })),
    }
    const has = (key: keyof ApiItemInput) => input[key] !== undefined
    // 사용자 정의 코드 (CUST_CD 키면 upsert가 키 값으로 다시 채운다)
    if (has('itemCustCd')) next.custCode = input.itemCustCd ?? ''
    // 글자 칸
    const TEXT: [keyof ApiItemInput, keyof ItemInput][] = [
      ['itemNm', 'name'],
      ['itemNmEn', 'nameEn'],
      ['shortNm', 'shortName'],
      ['spec', 'spec'],
      ['itemType', 'itemType'],
      ['category1', 'category1'],
      ['category2', 'category2'],
      ['category3', 'category3'],
      ['brandNm', 'brandName'],
      ['makerNm', 'makerName'],
      ['originCountry', 'originCountry'],
      ['hsCode', 'hsCode'],
      ['currency', 'currency'],
      ['tempZone', 'tempZone'],
      ['expiryType', 'expiryType'],
      ['expiryInput', 'expiryInput'],
      ['lotSource', 'lotSource'],
      ['allocRule', 'allocRule'],
      ['labelUom', 'labelUnit'],
      ['remark', 'remark'],
    ]
    for (const [from, to] of TEXT) {
      if (has(from)) (next as Record<string, unknown>)[to] = text(input[from] as string | null)
    }
    // 소수 칸 (글자로)
    if (has('itemValue')) next.itemValue = num(input.itemValue)
    if (has('storageTempMin')) next.storageTempMin = num(input.storageTempMin)
    if (has('storageTempMax')) next.storageTempMax = num(input.storageTempMax)
    // 정수·예/아니오 칸
    const SAME: (keyof ApiItemInput & keyof ItemInput)[] = [
      'maxStackBox',
      'shelfLifeDays',
      'minInboundShelfDays',
      'minOutboundShelfDays',
      'expiryAlertDays',
      'hazmat',
      'fragile',
      'upright',
      'boxOnlyShip',
    ]
    for (const key of SAME) {
      if (has(key)) (next as Record<string, unknown>)[key] = input[key] ?? null
    }
    if (input.expiryMgmt !== undefined) next.useExpiry = input.expiryMgmt
    if (input.lotMgmt !== undefined) next.useLot = input.lotMgmt
    if (input.serialMgmt !== undefined) next.useSerial = input.serialMgmt

    // 기본단위: BASE 행도 같이
    if (input.baseUom) {
      const unit = resolve(input.baseUom)
      next.baseUnitId = unit.id
      const base = next.units.find((u) => u.level === 'BASE')
      if (base) base.unitId = unit.id
      else next.units.unshift(EMPTY_UNIT_ROW('BASE', unit.id))
    }
    // 단위 행: 보낸 행만 추가·수정, delete면 지움 (안 보낸 행은 그대로)
    for (const uom of input.uoms ?? []) {
      const unit = resolve(uom.uom)
      const level: UnitLevel | undefined =
        uom.level ?? (next.units.find((u) => u.unitId === unit.id)?.level as UnitLevel | undefined)
      if (!level) {
        throw new ActionError(
          'VALIDATION',
          `uoms의 ${uom.uom}: 새 단위는 level(INNER·BOX·PLT)을 보내 주세요.`,
          'VALIDATION_FAILED',
        )
      }
      if (level === 'BASE' || unit.id === next.baseUnitId) {
        throw new ActionError(
          'VALIDATION',
          `uoms의 ${uom.uom}: 기본단위는 baseUom으로 정합니다.`,
          'BASE_UOM_INVALID',
        )
      }
      if (uom.delete) {
        next.units = next.units.filter((u) => u.level !== level)
        continue
      }
      let row = next.units.find((u) => u.level === level)
      if (!row) {
        row = EMPTY_UNIT_ROW(level, unit.id)
        next.units.push(row)
      }
      row.unitId = unit.id
      if (uom.qtyInBase !== undefined) row.convQty = num(uom.qtyInBase)
      for (const key of [
        'widthCm',
        'depthCm',
        'heightCm',
        'grossWeightKg',
        'netWeightKg',
      ] as const) {
        if (uom[key] !== undefined) row[key] = num(uom[key])
      }
    }
    // 기본 입고·주문단위 (null = 자동)
    if (has('defaultInboundUom')) {
      next.defaultInboundUnitId = input.defaultInboundUom ? resolve(input.defaultInboundUom).id : ''
    }
    if (has('defaultOrderUom')) {
      next.defaultOrderUnitId = input.defaultOrderUom ? resolve(input.defaultOrderUom).id : ''
    }
    // 팔레트 적재 (null = 모두 지움)
    if (input.pallet === null) {
      next.palletTypeCode = ''
      next.palletTi = null
      next.palletHi = null
      next.palletBoxQty = null
    } else if (input.pallet) {
      const p = input.pallet
      if (p.type !== undefined) next.palletTypeCode = text(p.type)
      if (p.ti !== undefined) next.palletTi = p.ti
      if (p.hi !== undefined) next.palletHi = p.hi
      if (p.boxQty !== undefined) next.palletBoxQty = p.boxQty
    }
    // 바코드: barcode로 찾아 추가·수정, delete면 지움. primary면 같은 단위의 다른 대표는 내린다
    for (const b of input.barcodes ?? []) {
      const unitId = resolve(b.uom).id
      if (b.delete) {
        next.barcodes = next.barcodes.filter((x) => x.barcode !== b.barcode)
        continue
      }
      let row = next.barcodes.find((x) => x.barcode === b.barcode)
      if (!row) {
        row = {
          unitId,
          barcode: b.barcode,
          barcodeType: barcodeTypeOf(b.barcode),
          isPrimary: false,
        }
        next.barcodes.push(row)
      }
      row.unitId = unitId
      if (b.type) row.barcodeType = b.type
      if (b.primary !== undefined) {
        if (b.primary) {
          for (const x of next.barcodes) if (x.unitId === unitId) x.isPrimary = false
        }
        row.isPrimary = b.primary
      }
    }
    return next
  }
}

// ── 오류 → 건별 오류 (field = 연동 이름)

const FIELD_OF: Record<string, string> = {
  code: 'itemCd',
  custCode: 'itemCustCd',
  name: 'itemNm',
  nameEn: 'itemNmEn',
  shortName: 'shortNm',
  brandName: 'brandNm',
  makerName: 'makerNm',
  baseUnitId: 'baseUom',
  defaultInboundUnitId: 'defaultInboundUom',
  defaultOrderUnitId: 'defaultOrderUom',
  palletTypeCode: 'pallet.type',
  palletTi: 'pallet.ti',
  palletHi: 'pallet.hi',
  palletBoxQty: 'pallet.boxQty',
  useExpiry: 'expiryMgmt',
  useLot: 'lotMgmt',
  useSerial: 'serialMgmt',
  labelUnit: 'labelUom',
}

function apiField(path: string) {
  const [head] = path.split('.')
  if (head === 'units') return 'uoms'
  if (head === 'barcodes') return 'barcodes'
  return FIELD_OF[head] ?? (head || undefined)
}

const ACTION_CODE: Record<string, string> = {
  VALIDATION: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'STATUS_NOT_ALLOWED',
  FORBIDDEN: 'STATUS_NOT_ALLOWED',
}

function errorOf(error: unknown) {
  if (!(error instanceof ActionError)) return null
  return {
    code: error.apiCode ?? ACTION_CODE[error.code] ?? 'VALIDATION_FAILED',
    message: error.message,
    field: error instanceof ItemInputError ? apiField(error.path) : undefined,
  }
}

const zodError = (error: z.ZodError) => {
  const issue = error.issues[0]
  const path = issue?.path.join('.') ?? ''
  return {
    code: path === 'itemCd' || path === 'itemCustCd' ? 'ITEM_CD_INVALID' : 'VALIDATION_FAILED',
    message: issue?.message ?? '입력값을 확인해 주세요.',
    field: path || undefined,
  }
}

const fail = (
  seq: number,
  docNo: string | null,
  error: { code: string; message: string; field?: string },
): ItemResult => ({ seq, docNo, result: 'FAIL', errors: [error] })

// ── 계산값 (응답·조회 공용)

type UnitRow = {
  level: string
  convQty: { toString(): string }
  widthCm: { toString(): string } | null
  depthCm: { toString(): string } | null
  heightCm: { toString(): string } | null
  cbm: { toString(): string } | null
  grossWeightKg: { toString(): string } | null
  netWeightKg: { toString(): string } | null
  autoCalcYn: string
  unit: { code: string }
}

const n = (value: { toString(): string } | null) =>
  value === null ? null : Number(qtyText(parseQty(value.toString())))

function computed(units: UnitRow[], palletBoxQty: number | null) {
  const box = units.find((u) => u.level === 'BOX')
  const plt = units.find((u) => u.level === 'PLT')
  const volumeOk = Boolean(box?.widthCm && box.depthCm && box.heightCm && box.grossWeightKg)
  return {
    volumeStatus: volumeOk ? 'OK' : 'MISSING',
    box: box
      ? { qtyInBase: n(box.convQty), cbm: n(box.cbm), grossWeightKg: n(box.grossWeightKg) }
      : null,
    plt: plt
      ? {
          qtyInBase: n(plt.convQty),
          boxQty: palletBoxQty,
          heightCm: n(plt.heightCm),
          cbm: n(plt.cbm),
          grossWeightKg: n(plt.grossWeightKg),
          calculated: isYes(plt.autoCalcYn),
        }
      : null,
  }
}

const UNIT_SELECT = {
  level: true,
  convQty: true,
  widthCm: true,
  depthCm: true,
  heightCm: true,
  cbm: true,
  grossWeightKg: true,
  netWeightKg: true,
  autoCalcYn: true,
  unit: { select: { code: true } },
} as const

const warningsOf = (warnings: ItemWarning[]) =>
  warnings.map((w) => ({ code: w.code, message: w.message }))

// 키 정리: 품목코드는 대문자, 사용자 정의 코드는 화주 시스템 값 그대로 (앞뒤 공백만 뺀다)
const keyOf = (keyType: IfKeyType, value: string) =>
  keyType === 'CUST_CD' ? value.trim() : value.trim().toUpperCase()

// ── POST /items

export async function postItems(ctx: ApiHandlerContext): Promise<ApiHandlerResult> {
  const list = readItems(ctx.body)
  const resolve = await unitResolver(ctx)
  // 찾는 키: 화주사 연동 조회 키 (0084)
  const keyType = await shipperIfKeyType(prisma, ctx.api.shipperId)
  const keyName = keyType === 'CUST_CD' ? 'itemCustCd' : 'itemCd'
  const items: ItemResult[] = []
  for (const [index, raw] of list.entries()) {
    const seq = index + 1
    const rawKey = (raw as Record<string, unknown> | null)?.[keyName]
    const docNo = typeof rawKey === 'string' ? keyOf(keyType, rawKey) : null
    const parsed = apiItemSchema.safeParse(raw)
    if (!parsed.success) {
      items.push(fail(seq, docNo, zodError(parsed.error)))
      continue
    }
    const input = parsed.data
    const key = keyOf(keyType, (keyType === 'CUST_CD' ? input.itemCustCd : input.itemCd) ?? '')
    if (!key) {
      items.push(
        fail(seq, null, {
          code: 'ITEM_CD_INVALID',
          message: `${keyName}를 보내 주세요 (이 화주사의 품목 조회 키).`,
          field: keyName,
        }),
      )
      continue
    }
    try {
      const done = await writeTransaction(ctx, async (tx: Db) => {
        const result = await upsertItem(
          tx,
          {
            shipperId: ctx.api.shipperId,
            keyType,
            key,
            code: input.itemCd ? input.itemCd.toUpperCase() : undefined,
            patch: patchOf(input, resolve),
            status: input.status,
          },
          { source: 'API', requestId: ctx.requestId },
        )
        const saved = await tx.item.findUniqueOrThrow({
          where: { id: result.id },
          select: { palletBoxQty: true, units: { select: UNIT_SELECT } },
        })
        return { result, saved }
      })
      items.push({
        seq,
        docNo: key,
        result: done.result.action,
        internalId: done.result.id,
        extra: {
          itemCd: done.result.code,
          itemCustCd: done.result.custCode,
          ...computed(done.saved.units, done.saved.palletBoxQty),
          warnings: warningsOf(done.result.warnings),
        },
      })
    } catch (error) {
      const itemError = errorOf(error)
      if (!itemError) throw error
      items.push(fail(seq, docNo, itemError))
    }
  }
  return { items }
}

// ── 조회

const ITEM_SELECT = {
  id: true,
  code: true,
  custCode: true,
  name: true,
  nameEn: true,
  shortName: true,
  spec: true,
  itemType: true,
  category1: true,
  category2: true,
  category3: true,
  brandName: true,
  makerName: true,
  originCountry: true,
  hsCode: true,
  itemValue: true,
  currency: true,
  baseUnit: { select: { code: true } },
  defaultInboundUnit: { select: { code: true } },
  defaultOrderUnit: { select: { code: true } },
  palletTypeCode: true,
  palletTi: true,
  palletHi: true,
  palletBoxQty: true,
  tempZone: true,
  storageTempMin: true,
  storageTempMax: true,
  hazmatYn: true,
  fragileYn: true,
  uprightYn: true,
  maxStackBox: true,
  useExpiry: true,
  expiryType: true,
  expiryInput: true,
  shelfLifeDays: true,
  minInboundShelfDays: true,
  minOutboundShelfDays: true,
  expiryAlertDays: true,
  useLot: true,
  lotSource: true,
  useSerial: true,
  allocRule: true,
  labelUnit: true,
  boxOnlyShipYn: true,
  status: true,
  source: true,
  remark: true,
  lastIfAt: true,
  updatedAt: true,
  units: { select: UNIT_SELECT, orderBy: { sortOrder: 'asc' } },
} as const

type ItemRow = {
  [K in keyof typeof ITEM_SELECT]: unknown
} & {
  id: bigint
  code: string
  name: string
  palletBoxQty: number | null
  units: UnitRow[]
  updatedAt: Date
  lastIfAt: Date | null
}

function toItem(row: ItemRow) {
  const r = row as Record<string, unknown> & ItemRow
  const dec = (v: unknown) => n(v as { toString(): string } | null)
  return {
    itemCd: r.code,
    itemCustCd: r.custCode,
    itemNm: r.name,
    itemNmEn: r.nameEn,
    shortNm: r.shortName,
    spec: r.spec,
    itemType: r.itemType,
    category1: r.category1,
    category2: r.category2,
    category3: r.category3,
    brandNm: r.brandName,
    makerNm: r.makerName,
    originCountry: r.originCountry,
    hsCode: r.hsCode,
    itemValue: dec(r.itemValue),
    currency: r.currency,
    baseUom: (r.baseUnit as { code: string }).code,
    defaultInboundUom: (r.defaultInboundUnit as { code: string } | null)?.code ?? null,
    defaultOrderUom: (r.defaultOrderUnit as { code: string } | null)?.code ?? null,
    uoms: r.units
      .filter((u) => u.level !== 'BASE')
      .map((u) => ({
        uom: u.unit.code,
        level: u.level,
        qtyInBase: n(u.convQty),
        widthCm: n(u.widthCm),
        depthCm: n(u.depthCm),
        heightCm: n(u.heightCm),
        cbm: n(u.cbm),
        grossWeightKg: n(u.grossWeightKg),
        netWeightKg: n(u.netWeightKg),
        calculated: isYes(u.autoCalcYn),
      })),
    pallet: {
      type: r.palletTypeCode,
      ti: r.palletTi,
      hi: r.palletHi,
      boxQty: r.palletBoxQty,
    },
    tempZone: r.tempZone,
    storageTempMin: dec(r.storageTempMin),
    storageTempMax: dec(r.storageTempMax),
    hazmat: isYes(r.hazmatYn as string),
    fragile: isYes(r.fragileYn as string),
    upright: isYes(r.uprightYn as string),
    maxStackBox: r.maxStackBox,
    expiryMgmt: isYes(r.useExpiry as string),
    expiryType: r.expiryType,
    expiryInput: r.expiryInput,
    shelfLifeDays: r.shelfLifeDays,
    minInboundShelfDays: r.minInboundShelfDays,
    minOutboundShelfDays: r.minOutboundShelfDays,
    expiryAlertDays: r.expiryAlertDays,
    lotMgmt: isYes(r.useLot as string),
    lotSource: r.lotSource,
    serialMgmt: isYes(r.useSerial as string),
    allocRule: r.allocRule,
    labelUom: r.labelUnit,
    boxOnlyShip: isYes(r.boxOnlyShipYn as string),
    status: r.status,
    source: r.source,
    remark: r.remark,
    ...computed(r.units, r.palletBoxQty),
    lastIfAt: r.lastIfAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }
}

// GET /items?updatedAfter=ISO&cursor=…&limit=100 — 키 순서, 다음 쪽은 nextCursor로
export async function getItems(ctx: ApiHandlerContext) {
  const url = new URL(ctx.request.url)
  const query = listQuerySchema.parse(Object.fromEntries(url.searchParams))
  const rows = await prisma.item.findMany({
    where: {
      shipperId: ctx.api.shipperId,
      ...(query.updatedAfter && { updatedAt: { gt: new Date(query.updatedAfter) } }),
      ...(query.cursor && { id: { gt: BigInt(query.cursor) } }),
    },
    select: ITEM_SELECT,
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  })
  const page = rows.slice(0, query.limit)
  return {
    items: page.map((row) => toItem(row as ItemRow)),
    nextCursor: rows.length > query.limit ? String(page[page.length - 1].id) : null,
  }
}

// GET /items/{itemCd} — 바코드 포함. 경로 값은 화주사 연동 조회 키(품목코드 또는 사용자 정의 코드)
export async function getItem(ctx: ApiHandlerContext) {
  const keyType = await shipperIfKeyType(prisma, ctx.api.shipperId)
  const code = keyOf(keyType, ctx.params.itemCd ?? '')
  const row = await prisma.item.findFirst({
    where: { shipperId: ctx.api.shipperId, ...keyWhere(keyType, code) },
    select: {
      ...ITEM_SELECT,
      barcodes: {
        select: {
          barcode: true,
          barcodeType: true,
          isPrimary: true,
          unit: { select: { code: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  })
  if (!row) throw new ApiError('NOT_FOUND', { message: `없는 품목입니다: ${code}` })
  const { barcodes, ...item } = row
  return {
    ...toItem(item as ItemRow),
    barcodes: barcodes.map((b) => ({
      uom: b.unit.code,
      barcode: b.barcode,
      type: b.barcodeType,
      primary: isYes(b.isPrimary),
    })),
  }
}
