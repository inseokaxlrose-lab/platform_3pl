import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import {
  buildPreview,
  requiredIssues,
  type UploadIssue,
  type UploadPreview,
  type UploadRow,
} from '@/lib/excel/upload'
import type { IfKeyType } from '@/lib/master-code/if-key'
import { prisma, type Db } from '@/lib/prisma'
import { scopeFilter, sharedOperatorFilter, type DataScope } from '@/lib/scope/data-scope'
import { SHIPPER_SETUP_ONLY } from '@/lib/shippers/shipper-codes'
import { ITEM_STATUS, type BarcodeType, type ItemStatus, type UnitLevel } from './item-codes'
import { EMPTY_UNIT_ROW } from './item-defaults'
import { SHIPPER_SCOPE } from './item-list'
import type { ItemInput, ItemUnitInput } from './item-schema'
import { itemUploadTemplate } from './item-upload-template'
import { upsertItem } from './item-upsert'

// 품목 엑셀 업로드 (docs/decisions/0083 ②) — 품목 API(③)와 같은 upsert 서비스
// 검증: 파일 전체를 한 트랜잭션에서 실제로 처리해 본 뒤 되돌린다 (신규·수정·경고까지 미리보기)
// 등록: 같은 처리를 다시 하고, 오류가 하나라도 있으면 아무것도 저장하지 않는다 (0049 공통 규칙)
// 비운 칸은 "안 보냄" — 이미 있는 품목은 그 칸을 그대로 둔다 (사용자 결정)

const YN: Record<string, boolean> = { Y: true, N: false, 예: true, 아니오: false }
const STATUS_OF: Record<string, ItemStatus> = {
  사용: 'ACTIVE',
  사용중지: 'INACTIVE',
  '사용 중지': 'INACTIVE',
  단종: 'DISCONTINUED',
  ...Object.fromEntries(ITEM_STATUS.values.map((v) => [v, v])),
}

// 글자 칸 (값을 그대로 넣는다 — 형식은 입력 규칙이 검사)
const TEXT_KEYS = [
  'custCode',
  'name',
  'nameEn',
  'shortName',
  'spec',
  'category1',
  'category2',
  'category3',
  'brandName',
  'makerName',
  'originCountry',
  'hsCode',
  'currency',
  'remark',
] as const
// 코드 칸 (대문자로)
const CODE_KEYS = ['itemType', 'tempZone', 'expiryType', 'expiryInput', 'lotSource'] as const
// 정수 칸
const INT_KEYS = [
  'palletTi',
  'palletHi',
  'palletBoxQty',
  'maxStackBox',
  'shelfLifeDays',
  'minInboundShelfDays',
  'minOutboundShelfDays',
  'expiryAlertDays',
] as const
// 예/아니오 칸
const YN_KEYS = ['hazmat', 'fragile', 'upright', 'useExpiry', 'useLot', 'boxOnlyShip'] as const
// 소수 칸 (쉼표 허용)
const DECIMAL_KEYS = [
  'itemValue',
  'innerQty',
  'boxQty',
  'boxWidth',
  'boxDepth',
  'boxHeight',
  'boxWeight',
  'pltQty',
] as const
// 단위별 대표 바코드 칸
const BARCODE_KEYS: [string, UnitLevel][] = [
  ['baseBarcode', 'BASE'],
  ['innerBarcode', 'INNER'],
  ['boxBarcode', 'BOX'],
  ['pltBarcode', 'PLT'],
]

// 바코드 종류 짐작: 숫자 자리수로 (나머지는 화주 자체)
function barcodeTypeOf(barcode: string): BarcodeType {
  if (!/^\d+$/.test(barcode)) return 'CUSTOM'
  return (
    ({ 8: 'EAN8', 12: 'UPCA', 13: 'EAN13', 14: 'ITF14' } as Record<number, BarcodeType>)[
      barcode.length
    ] ?? 'CUSTOM'
  )
}

// 한 행을 해석한 결과
type Prepared = {
  row: UploadRow
  shipperId: bigint
  keyType: IfKeyType
  // 찾는 키 값 (비면 새 품목)
  key: string
  // 새 품목의 품목코드 (비우면 자동 생성)
  code: string
  status?: ItemStatus
  patch: (current: ItemInput) => ItemInput
}

// 파일 → 행별 patch (형식 오류는 issues에)
async function prepareRows(rows: UploadRow[], scope: DataScope) {
  const issues: UploadIssue[] = requiredIssues(itemUploadTemplate, rows)
  const add = (row: UploadRow, column: string | undefined, message: string) =>
    issues.push({ rowNo: row.rowNo, column, message })
  const [shippers, units] = await Promise.all([
    prisma.shipper.findMany({
      where: { AND: [scopeFilter(scope, SHIPPER_SCOPE), SHIPPER_SETUP_ONLY] },
      select: { id: true, code: true, ifKeyType: true },
    }),
    prisma.unit.findMany({ where: sharedOperatorFilter(scope), select: { id: true, code: true } }),
  ])
  // 화주사코드 → { id, 품목을 찾는 키 종류 }
  const shipperByCode = new Map(
    shippers.map((s) => [
      s.code.toUpperCase(),
      { id: s.id, keyType: (s.ifKeyType === 'CUST_CD' ? 'CUST_CD' : 'CODE') as IfKeyType },
    ]),
  )
  const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), String(u.id)]))

  const prepared: Prepared[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const value = (key: string) => (row.values[key] ?? '').trim()
    const shipperCode = value('shipperCode').toUpperCase()
    const code = value('code').toUpperCase()
    const custCode = value('custCode')
    if (!shipperCode) continue
    const before = issues.length
    const shipper = shipperByCode.get(shipperCode)
    const shipperId = shipper?.id
    if (!shipper)
      add(row, 'shipperCode', `없거나 품목을 등록할 수 없는 화주사입니다 (${shipperCode}).`)
    // 찾는 키: 화주사 연동 조회 키 (품목코드 또는 사용자 정의 코드, 0084)
    const keyType: IfKeyType = shipper?.keyType ?? 'CODE'
    const key = keyType === 'CUST_CD' ? custCode : code
    const keyColumn = keyType === 'CUST_CD' ? 'custCode' : 'code'
    if (shipper && keyType === 'CUST_CD' && !custCode) {
      add(
        row,
        'custCode',
        '이 화주사는 사용자정의코드로 품목을 찾습니다. 사용자정의코드를 넣어 주세요.',
      )
    }
    // 키를 비운 줄(품목코드 자동 생성)은 매번 새 품목이라 겹침 검사에서 뺀다
    if (key) {
      const seenKey = `${shipperCode}|${key}`
      if (seen.has(seenKey)) add(row, keyColumn, '같은 화주사·품목의 줄이 이미 있습니다.')
      seen.add(seenKey)
    }

    // 칸 해석 (넣은 칸만 patch에 들어간다)
    const set: Partial<Record<string, unknown>> = {}
    for (const k of TEXT_KEYS) if (value(k)) set[k] = value(k)
    for (const k of CODE_KEYS) if (value(k)) set[k] = value(k).toUpperCase()
    for (const k of INT_KEYS) {
      if (!value(k)) continue
      if (!/^\d+$/.test(value(k).replace(/,/g, ''))) add(row, k, '숫자(정수)로 넣어 주세요.')
      else set[k] = Number(value(k).replace(/,/g, ''))
    }
    for (const k of YN_KEYS) {
      if (!value(k)) continue
      const yn = YN[value(k).toUpperCase()] ?? YN[value(k)]
      if (yn === undefined) add(row, k, 'Y / N 중 하나입니다.')
      else set[k] = yn
    }
    const decimal: Partial<Record<(typeof DECIMAL_KEYS)[number], string>> = {}
    for (const k of DECIMAL_KEYS) {
      if (!value(k)) continue
      const text = value(k).replace(/,/g, '')
      if (!/^\d+(\.\d+)?$/.test(text)) add(row, k, '숫자로 넣어 주세요.')
      else decimal[k] = text
    }
    if (decimal.itemValue) set.itemValue = decimal.itemValue
    const unitOf = (k: string) => {
      if (!value(k)) return undefined
      const id = unitByCode.get(value(k).toUpperCase())
      if (!id) add(row, k, `없는 단위 코드입니다 (${value(k)}).`)
      return id
    }
    const baseUnitId = unitOf('baseUnit')
    const innerUnitId = unitOf('innerUnit')
    const boxUnitId = unitOf('boxUnit')
    const palletType = value('palletType').toUpperCase()
    const statusText = value('status')
    const status = statusText ? STATUS_OF[statusText] : undefined
    if (statusText && !status) add(row, 'status', '사용 / 사용중지 / 단종 중 하나입니다.')
    const barcodes = BARCODE_KEYS.flatMap(([k, level]) =>
      value(k) ? [{ level, barcode: value(k) }] : [],
    )
    if (issues.length > before || !shipperId) continue

    const boxFields = {
      convQty: decimal.boxQty,
      widthCm: decimal.boxWidth,
      depthCm: decimal.boxDepth,
      heightCm: decimal.boxHeight,
      grossWeightKg: decimal.boxWeight,
    }
    const hasBox = boxUnitId !== undefined || Object.values(boxFields).some((v) => v !== undefined)

    const patch = (current: ItemInput): ItemInput => {
      const next: ItemInput = {
        ...current,
        ...set,
        units: current.units.map((u) => ({ ...u })),
        barcodes: current.barcodes.map((b) => ({ ...b })),
      }
      // 레벨 행 고치기 (없으면 만든다 — 단위를 모르면 그 레벨 이름의 단위)
      const rowOf = (level: UnitLevel, unitId: string | undefined) => {
        let target = next.units.find((u) => u.level === level)
        if (!target) {
          target = EMPTY_UNIT_ROW(level, unitId ?? unitByCode.get(level) ?? '')
          next.units.push(target)
        } else if (unitId) target.unitId = unitId
        return target
      }
      const assign = (target: ItemUnitInput, fields: Partial<ItemUnitInput>) => {
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) (target as Record<string, unknown>)[k] = v
        }
      }
      if (baseUnitId) {
        next.baseUnitId = baseUnitId
        rowOf('BASE', baseUnitId)
      }
      if (innerUnitId || decimal.innerQty) {
        assign(rowOf('INNER', innerUnitId), { convQty: decimal.innerQty })
      }
      if (hasBox) assign(rowOf('BOX', boxUnitId), boxFields)
      if (decimal.pltQty) assign(rowOf('PLT', undefined), { convQty: decimal.pltQty })
      if (palletType) next.palletTypeCode = palletType
      // 기한·LOT을 켜기만 하면 처음 고르는 값 (화면·새 품목과 같다)
      if (next.useExpiry && !next.expiryType) next.expiryType = 'CONSUME'
      if (next.useExpiry && !next.expiryInput) next.expiryInput = 'EXPIRY'
      if (next.useLot && !next.lotSource) next.lotSource = 'INPUT'
      // 단위별 대표 바코드: 있으면 대표로, 없으면 대표로 더한다 (같은 단위의 다른 대표는 내린다)
      for (const { level, barcode } of barcodes) {
        const unitId =
          level === 'BASE' ? next.baseUnitId : next.units.find((u) => u.level === level)?.unitId
        if (!unitId) {
          throw new ActionError(
            'VALIDATION',
            `${level} 바코드: 이 품목에 ${level} 단위가 없습니다.`,
          )
        }
        for (const b of next.barcodes) if (b.unitId === unitId) b.isPrimary = false
        const found = next.barcodes.find((b) => b.barcode === barcode)
        if (found) {
          found.unitId = unitId
          found.isPrimary = true
        } else {
          next.barcodes.push({
            unitId,
            barcode,
            barcodeType: barcodeTypeOf(barcode),
            isPrimary: true,
          })
        }
      }
      return next
    }
    prepared.push({ row, shipperId, keyType, key, code, status, patch })
  }
  return { issues, prepared }
}

type RunSummary = {
  created: number
  updated: number
  unchanged: number
  volumeMissing: number
  palletWarned: number
}

const PALLET_WARNINGS = new Set(['PALLET_HEIGHT_EXCEEDED', 'PALLET_WEIGHT_EXCEEDED'])

// 행들을 실제로 처리 (한 트랜잭션 안). 업무 오류는 그 행에 붙인다
async function runRows(tx: Db, prepared: Prepared[], issues: UploadIssue[]) {
  const summary: RunSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    volumeMissing: 0,
    palletWarned: 0,
  }
  for (const p of prepared) {
    try {
      const result = await upsertItem(
        tx,
        {
          shipperId: p.shipperId,
          keyType: p.keyType,
          key: p.key,
          code: p.code || undefined,
          patch: p.patch,
          status: p.status,
        },
        { source: 'UPLOAD' },
      )
      summary[
        result.action === 'CREATED'
          ? 'created'
          : result.action === 'UPDATED'
            ? 'updated'
            : 'unchanged'
      ]++
      if (result.warnings.some((w) => w.code === 'VOLUME_MISSING')) summary.volumeMissing++
      if (result.warnings.some((w) => PALLET_WARNINGS.has(w.code))) summary.palletWarned++
    } catch (error) {
      if (!(error instanceof ActionError)) throw error
      issues.push({ rowNo: p.row.rowNo, message: error.message })
    }
  }
  return summary
}

class Rollback extends Error {}

const summaryText = (s: RunSummary) =>
  `신규 ${s.created} · 수정 ${s.updated} · 변경 없음 ${s.unchanged} / 체적 미등록 ${s.volumeMissing} · 팔레트 높이·중량 초과 ${s.palletWarned}`

// 검증 (저장 안 함): 실제로 처리해 본 뒤 되돌린다
export async function previewItemUpload(
  rows: UploadRow[],
  scope: DataScope,
): Promise<UploadPreview> {
  const { issues, prepared } = await prepareRows(rows, scope)
  let summary: RunSummary | null = null
  try {
    await prisma.$transaction(
      async (tx) => {
        summary = await runRows(tx, prepared, issues)
        throw new Rollback()
      },
      { timeout: 120_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  const preview = buildPreview(itemUploadTemplate, rows, issues)
  return issues.length === 0 && summary
    ? { ...preview, summary: `${rows.length}행 모두 올바릅니다. ${summaryText(summary)}` }
    : preview
}

// 등록: 다시 처리하고, 오류가 하나라도 있으면 되돌린다
export async function commitItemUpload(rows: UploadRow[], scope: DataScope) {
  const { issues, prepared } = await prepareRows(rows, scope)
  const fail = () =>
    new ActionError('VALIDATION', '오류가 있는 행이 있어 등록하지 않았습니다. 다시 확인해 주세요.')
  if (issues.length > 0) throw fail()
  return prisma.$transaction(
    async (tx) => {
      const summary = await runRows(tx, prepared, issues)
      if (issues.length > 0) throw fail()
      return { message: `등록했습니다. ${summaryText(summary)}` }
    },
    { timeout: 120_000 },
  )
}
