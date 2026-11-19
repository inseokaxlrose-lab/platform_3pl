import { breakdownQty, parseQty, qtyText, type QtyPart } from '@/lib/units/convert'
import type { UnitLevel } from './item-codes'

// 품목 단위 환산 (docs/decisions/0042, 0083) — 품목의 단위 표(레벨별 환산수량·규격)로 계산하는 순수 함수
// DB에서 단위 표를 읽는 쪽은 item-convert.ts (서버 전용). 화면도 이미 가진 단위 표로 이 함수를 쓸 수 있다
// 수량은 글자, 계산은 convert.ts와 같은 BigInt 고정 소수점(×10⁶)

const SCALE = 10n ** 6n

// 품목의 단위 한 줄 (BASE 행 포함 — BASE의 환산수량은 1)
export type ItemUomRow = {
  level: UnitLevel
  unitCode: string
  // 1 이 단위 = convQty 기본단위
  convQty: string
  // 이 단위로 셀 수 있는 소수 자리수 (EA 0, KG 3, 포장 단위 0)
  decimals: number
  cbm?: string | null
  grossWeightKg?: string | null
}

export type ItemUomTable = {
  baseUnitCode: string
  units: ItemUomRow[]
}

// 단위 코드 → 행 (없으면 오류: 이 품목에 없는 단위)
function rowOf(table: ItemUomTable, unitCode: string): ItemUomRow {
  const row = table.units.find((u) => u.unitCode === unitCode)
  if (!row) throw new Error(`이 품목에 없는 단위입니다: ${unitCode}`)
  return row
}

// 소수 자리 검사 (끝의 0 제외)
function assertDecimals(scaled: bigint, decimals: number, unitCode: string, qty: string) {
  const step = 10n ** BigInt(6 - decimals)
  if (scaled % step !== 0n) {
    throw new Error(
      decimals === 0
        ? `${unitCode}은(는) 정수로만 셀 수 있습니다: ${qty}`
        : `${unitCode}은(는) 소수 ${decimals}자리까지입니다: ${qty}`,
    )
  }
}

// 기본단위 수량 (고정 소수점) — 입력 수량은 그 단위의 소수 자리수 안이어야 한다
function baseScaled(table: ItemUomTable, qty: string, unitCode: string): bigint {
  const row = rowOf(table, unitCode)
  const scaled = parseQty(qty)
  if (scaled < 0n) throw new Error(`수량은 0 이상이어야 합니다: ${qty}`)
  assertDecimals(scaled, row.decimals, unitCode, qty)
  const product = scaled * parseQty(row.convQty)
  if (product % SCALE !== 0n)
    throw new Error(`환산 결과가 소수 6자리를 넘습니다: ${qty} ${unitCode}`)
  return product / SCALE
}

// 이 단위 수량 → 기본단위 수량 (재고 저장 직전 반드시 이것으로: 3 BOX × 24 → '72')
export function toItemBaseQtyIn(table: ItemUomTable, qty: string, unitCode: string): string {
  return qtyText(baseScaled(table, qty, unitCode))
}

export type ConvertResult = {
  // 대상 단위 수량 (remainder 옵션이면 대상 단위 자리수까지 내림)
  qty: string
  // 대상 단위로 못 나눈 나머지 (기본단위 수량, 나누어떨어지면 '0')
  remainder: string
}

// 품목 단위 간 환산: qty × from 환산수량 ÷ to 환산수량
// 결과가 대상 단위의 자리수를 넘으면 오류 (remainder: true면 대상 단위로 내림 + 나머지를 기본단위로)
// 예: 100 EA → BOX(24) = 오류 / remainder → { qty: '4', remainder: '4' }
export function convertItemQtyIn(
  table: ItemUomTable,
  qty: string,
  fromUnitCode: string,
  toUnitCode: string,
  options: { remainder?: boolean } = {},
): ConvertResult {
  const base = baseScaled(table, qty, fromUnitCode)
  const to = rowOf(table, toUnitCode)
  const toConv = parseQty(to.convQty)
  // 대상 단위 수량 (고정 소수점, 대상 자리수까지 내림)
  const step = 10n ** BigInt(6 - to.decimals)
  const exact = (base * SCALE) / toConv
  const floored = exact - (exact % step)
  const used = (floored * toConv) / SCALE
  const remainder = base - used
  if (remainder !== 0n && !options.remainder) {
    throw new Error(
      `${qty} ${fromUnitCode}은(는) ${toUnitCode}(${qtyText(toConv)} ${table.baseUnitCode})로 나누어떨어지지 않습니다.`,
    )
  }
  return { qty: qtyText(floored), remainder: qtyText(remainder) }
}

// 기본단위 수량을 큰 단위부터 나누기 (피킹·출력 표시용): 1,000 EA, PLT 960·BOX 24 → 1 PLT · 1 BOX · 16 EA
export function splitByUomIn(table: ItemUomTable, baseQty: string): QtyPart[] {
  const packs = table.units
    .filter((u) => u.level !== 'BASE')
    .map((u) => ({ unit: u.unitCode, convQty: u.convQty }))
  return breakdownQty(baseQty, packs, table.baseUnitCode)
}

export type VolumeResult =
  | { status: 'OK'; cbm: string; grossWeightKg: string | null; boxes: string; remainder: string }
  | { status: 'VOLUME_MISSING'; cbm: null; grossWeightKg: null; reason: string }

// 반올림 나눗셈 (고정 소수점, 양수)
const divRound = (a: bigint, b: bigint) => (a + b / 2n) / b

// 수량의 체적(CBM)·중량: BOX 규격 기준. 낱개(BASE) 규격이 있으면 나머지는 낱개 규격으로, 없으면 BOX를 나눠 비례
// BOX 단위·CBM이 없으면 계산하지 않는다 (체적 미등록)
export function calcItemVolumeIn(table: ItemUomTable, baseQty: string): VolumeResult {
  const box = table.units.find((u) => u.level === 'BOX')
  if (!box || !box.cbm) {
    return {
      status: 'VOLUME_MISSING',
      cbm: null,
      grossWeightKg: null,
      reason: box ? 'BOX 규격(가로·세로·높이)이 없습니다.' : 'BOX 단위가 없습니다.',
    }
  }
  const base = parseQty(baseQty)
  if (base < 0n) throw new Error(`수량은 0 이상이어야 합니다: ${baseQty}`)
  const boxConv = parseQty(box.convQty)
  const boxes = base / boxConv
  const rest = base - boxes * boxConv
  const single = table.units.find((u) => u.level === 'BASE')

  // 값 하나(cbm 또는 중량) 계산: 박스 수 × BOX 값 + 나머지(낱개 값 × 나머지, 없으면 BOX 값 × 나머지 / 환산수량)
  const total = (boxValue: string, singleValue: string | null | undefined) => {
    const boxScaled = parseQty(boxValue)
    const full = boxes * boxScaled
    if (rest === 0n) return full
    const part = singleValue
      ? divRound(rest * parseQty(singleValue), SCALE)
      : divRound(rest * boxScaled, boxConv)
    return full + part
  }
  const cbm = total(box.cbm, single?.cbm)
  const weight = box.grossWeightKg ? total(box.grossWeightKg, single?.grossWeightKg) : null
  return {
    status: 'OK',
    cbm: qtyText(cbm),
    grossWeightKg: weight === null ? null : qtyText(divRound(weight, 1000n) * 1000n),
    boxes: boxes.toString(),
    remainder: qtyText(rest),
  }
}
