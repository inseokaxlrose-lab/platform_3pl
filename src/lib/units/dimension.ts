import { convertPhysical, type PhysicalUnit } from './physical'

// 길이·무게 표시 단위 변환 (docs/decisions/0075·0078) — 화면·서버 공용 순수 함수
// 로케이션 용량은 DB에 항상 cm·kg로 저장하고(칸 정의), 운영사 표시 단위(weight_unit_cd·length_unit_cd →
// 단위 기준정보의 중량·길이 단위)로 바꿔 보여 주며, 입력은 저장 전에 cm·kg로 되돌린다
// 계산은 convertPhysical(분수, 부동소수점 없음). 설비 치수라 소수 2자리 반올림

// 화면 표시 단위: 단위 기준정보의 한 줄 + 표시 글자 (출력명, 없으면 코드 소문자: cm·inch·kg·lb)
export type DisplayUnit = PhysicalUnit & { label: string }
export type DisplayUnits = { length: DisplayUnit; weight: DisplayUnit }

// 저장 단위 (칸 정의로 고정 — 시스템 단위 CM·KG와 같은 계수)
const STORED_LENGTH: PhysicalUnit = { code: 'CM', type: 'LENGTH', baseFactor: '0.01' }
const STORED_WEIGHT: PhysicalUnit = { code: 'KG', type: 'WEIGHT', baseFactor: '1' }
const METRE: PhysicalUnit = { code: 'M', type: 'LENGTH', baseFactor: '1' }
export const DEFAULT_DISPLAY_UNITS: DisplayUnits = {
  length: { ...STORED_LENGTH, label: 'cm' },
  weight: { ...STORED_WEIGHT, label: 'kg' },
}

// 글자 수 → 글자 수 (비면 '', 바꿀 수 없으면 그대로)
function convert(text: string | null | undefined, from: PhysicalUnit, to: PhysicalUnit) {
  if (text === null || text === undefined || text.trim() === '') return ''
  const result = convertPhysical(text.replace(/,/g, ''), from, to, 2)
  return result.ok ? result.qty : text
}

// 저장 값(cm) → 화면 값(운영사 단위)
export const cmToLength = (cm: string | null | undefined, unit: DisplayUnit) =>
  convert(cm, STORED_LENGTH, unit)
// 화면 값(운영사 단위) → 저장 값(cm)
export const lengthToCm = (value: string | null | undefined, unit: DisplayUnit) =>
  convert(value, unit, STORED_LENGTH)
export const kgToWeight = (kg: string | null | undefined, unit: DisplayUnit) =>
  convert(kg, STORED_WEIGHT, unit)
export const weightToKg = (value: string | null | undefined, unit: DisplayUnit) =>
  convert(value, unit, STORED_WEIGHT)

// 가로·세로·높이(cm) → 부피(CBM, m³), 소수 4자리. 하나라도 비거나 숫자가 아니면 ''
// cm³ ÷ 1,000,000 = m³ — 길이를 cm → m로 바꿔 곱한다 (분수 계산)
export function cbmOf(widthCm: string, depthCm: string, heightCm: string) {
  const meters = [widthCm, depthCm, heightCm].map((v) =>
    v.trim() === '' ? null : convertPhysical(v.replace(/,/g, ''), STORED_LENGTH, METRE, 10),
  )
  if (meters.some((m) => !m || !m.ok)) return ''
  const [w, d, h] = meters.map((m) => (m as { qty: string }).qty)
  // m × m × m: 소수 10자리 × 3 → 정수로 곱한 뒤 4자리로 반올림
  const scale = 10n ** 10n
  const toInt = (q: string) => {
    const [int, frac = ''] = q.split('.')
    return BigInt(int) * scale + BigInt(frac.padEnd(10, '0').slice(0, 10))
  }
  const product = toInt(w) * toInt(d) * toInt(h) // 소수 30자리
  const unit = 10n ** 26n // 30자리 → 4자리
  const rounded = (product + unit / 2n) / unit
  const text = `${rounded / 10000n}.${(rounded % 10000n).toString().padStart(4, '0')}`
  return text.replace(/0+$/, '').replace(/\.$/, '')
}
