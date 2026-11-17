import { checkQtyDecimals } from './convert'
import { isPhysicalType } from './unit-labels'

// 물리 단위(중량·부피·길이·면적) 환산과 수량 자리수 (docs/decisions/0078) — 화면·서버 공용 순수 함수
// - 같은 유형끼리만: qty × from.baseFactor ÷ to.baseFactor (예: 500 G → 0.5 KG)
// - 수량·포장 단위(EA·BOX…)의 환산은 품목마다 다르므로 여기서 하지 않는다 → 품목 환산(convert.ts toBaseQty)
// - 부동소수점 대신 분수(BigInt 분자/분모)로 계산하고 마지막에 한 번만 반올림한다
//   (환산계수는 소수 10자리까지 — LB 0.45359237 — 라 수량 함수의 6자리 고정 소수점보다 넓게)

// 환산에 필요한 단위 정보 (DB 단위 표에서 그대로)
export type PhysicalUnit = {
  code: string
  type: string
  // 1 이 단위 = baseFactor × 유형 기준단위 (글자, 기준단위는 '1')
  baseFactor: string | null
}

export type ConvertResult = { ok: true; qty: string } | { ok: false; error: string }

// 글자 수 → 분수 (예: '-1.25' → -125 / 100). 잘못된 글자면 null
function toFraction(text: string): [bigint, bigint] | null {
  const value = text.trim().replace(/,/g, '')
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return null
  const [, sign, int, frac = ''] = match
  const numerator = BigInt(int + frac) * (sign ? -1n : 1n)
  return [numerator, 10n ** BigInt(frac.length)]
}

// 분수 → 소수 decimals자리 글자 (반올림: 0.5는 0에서 먼 쪽), 끝의 0은 뺀다
function fractionText(numerator: bigint, denominator: bigint, decimals: number) {
  const negative = numerator < 0n !== denominator < 0n && numerator !== 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const scale = 10n ** BigInt(decimals)
  const scaled = (n * scale * 2n + d) / (2n * d)
  const int = scaled / scale
  const frac = (scaled % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  const body = frac ? `${int}.${frac}` : `${int}`
  return negative && scaled !== 0n ? `-${body}` : body
}

// 물리 단위 환산: 같은 유형이고 둘 다 환산계수가 있을 때만. decimals: 결과 소수 자리수 (기본 10)
export function convertPhysical(
  qty: string,
  from: PhysicalUnit,
  to: PhysicalUnit,
  decimals = 10,
): ConvertResult {
  const value = toFraction(qty)
  if (!value) return { ok: false, error: `수량이 숫자가 아닙니다: ${qty}` }
  if (!isPhysicalType(from.type) || !isPhysicalType(to.type)) {
    return {
      ok: false,
      error: `${from.code}→${to.code}: 수량·포장 단위는 품목마다 환산이 달라 품목 환산을 써야 합니다.`,
    }
  }
  if (from.type !== to.type) {
    return { ok: false, error: `${from.code}→${to.code}: 유형이 달라 바꿀 수 없습니다.` }
  }
  const fromFactor = from.baseFactor ? toFraction(from.baseFactor) : null
  const toFactor = to.baseFactor ? toFraction(to.baseFactor) : null
  if (!fromFactor || !toFactor || toFactor[0] === 0n) {
    return { ok: false, error: `${from.code}→${to.code}: 환산계수가 없습니다.` }
  }
  // qty × (from.n / from.d) ÷ (to.n / to.d)
  const numerator = value[0] * fromFactor[0] * toFactor[1]
  const denominator = value[1] * fromFactor[1] * toFactor[0]
  return { ok: true, qty: fractionText(numerator, denominator, decimals) }
}

// 단위 소수 자리수로 반올림 (화면 표시·입력 정리용). 숫자가 아니면 그대로
export function roundQty(qty: string, unit: { decimals: number }) {
  const value = toFraction(qty)
  return value ? fractionText(value[0], value[1], unit.decimals) : qty
}

// 저장 전 검사: 단위 소수 자리수를 넘는 소수가 있으면 오류 문구, 괜찮으면 null
export function validateQty(qty: string, unit: { code: string; decimals: number }) {
  if (!toFraction(qty)) return `수량이 숫자가 아닙니다: ${qty}`
  return checkQtyDecimals(qty.replace(/,/g, ''), unit.decimals)
    ? null
    : unit.decimals === 0
      ? `${unit.code}는 정수로만 입력할 수 있습니다.`
      : `${unit.code}는 소수 ${unit.decimals}자리까지 입력할 수 있습니다.`
}

// 품목별 포장단위 환산 (상품 작업 범위, 0042): 수량·포장 단위는 품목의 입수량으로 바꾼다
// convertItemQty(itemId, qty, fromUnit, toUnit)는 품목 환산(tb_item_unit)을 읽어 toBaseQty·splitBaseQty로 계산한다
// — 지금은 화면마다 품목 입수량을 이미 갖고 있어 convert.ts의 순수 함수를 바로 쓴다 (서버 조회 함수는 출고 작업 때)
