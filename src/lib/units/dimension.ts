// 길이·무게 표시 단위 변환 (docs/decisions/0075) — 화면·서버 공용 순수 함수
// 로케이션 용량은 DB에 항상 cm·kg로 저장하고, 운영사 단위(length_unit_cd·weight_unit_cd)가
// INCH·LB면 화면에서만 바꿔 보여 주고, 입력은 저장 전에 cm·kg로 되돌린다
// (재고 수량이 아니라 설비 치수라 소수 2자리 반올림으로 충분하다)

export type LengthUnit = 'CM' | 'INCH'
export type WeightUnit = 'KG' | 'LB'

// 1 단위 = 몇 cm·kg
const CM_PER: Record<LengthUnit, number> = { CM: 1, INCH: 2.54 }
const KG_PER: Record<WeightUnit, number> = { KG: 1, LB: 0.45359237 }

export const LENGTH_LABEL: Record<LengthUnit, string> = { CM: 'cm', INCH: 'inch' }
export const WEIGHT_LABEL: Record<WeightUnit, string> = { KG: 'kg', LB: 'lb' }

const round2 = (n: number) => Math.round(n * 100) / 100

// 글자 숫자 → 글자 숫자 (비면 '')
function convert(text: string | null | undefined, factor: number) {
  if (text === null || text === undefined || text.trim() === '') return ''
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? String(round2(n * factor)) : text
}

// 저장 값(cm) → 화면 값(운영사 단위)
export const cmToLength = (cm: string | null | undefined, unit: LengthUnit) =>
  convert(cm, 1 / CM_PER[unit])
// 화면 값(운영사 단위) → 저장 값(cm)
export const lengthToCm = (value: string | null | undefined, unit: LengthUnit) =>
  convert(value, CM_PER[unit])
export const kgToWeight = (kg: string | null | undefined, unit: WeightUnit) =>
  convert(kg, 1 / KG_PER[unit])
export const weightToKg = (value: string | null | undefined, unit: WeightUnit) =>
  convert(value, KG_PER[unit])

// 가로·세로·높이(cm) → 부피(CBM, m³), 소수 4자리. 하나라도 비면 ''
export function cbmOf(widthCm: string, depthCm: string, heightCm: string) {
  const parts = [widthCm, depthCm, heightCm].map((v) => Number(v))
  if (
    [widthCm, depthCm, heightCm].some((v) => v.trim() === '') ||
    parts.some((n) => !Number.isFinite(n))
  ) {
    return ''
  }
  const cbm = (parts[0] * parts[1] * parts[2]) / 1_000_000
  return String(Math.round(cbm * 10_000) / 10_000)
}
