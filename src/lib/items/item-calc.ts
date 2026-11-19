import { parseQty, qtyText, toBaseQty } from '@/lib/units/convert'
import type { BarcodeType, UnitLevel } from './item-codes'

// 품목 규격·팔레트 계산 (docs/decisions/0083) — 화면 미리보기·서버 저장·API 결과가 같이 쓰는 순수 함수
// 숫자는 글자로 주고받고 BigInt 고정 소수점(6자리, convert.ts)으로 계산한다 → 소수 오차 없음
// 규격 저장 단위는 cm·kg (화면은 운영사 표시 단위로 바꿔 보여 준다, 0078)

const SCALE = 1_000_000n

// 고정 소수점(×1,000,000) → 소수 n자리 글자 (반올림)
function fixed(scaled: bigint, digits: number): string {
  const unit = 10n ** BigInt(6 - digits)
  const rounded = (scaled + (scaled >= 0n ? unit / 2n : -unit / 2n)) / unit
  const sign = rounded < 0n ? '-' : ''
  const abs = rounded < 0n ? -rounded : rounded
  if (digits === 0) return `${sign}${abs}`
  const text = abs.toString().padStart(digits + 1, '0')
  return `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`
}

const value = (text: string | null | undefined) =>
  text === null || text === undefined || text.trim() === '' ? null : parseQty(text)

// CBM = 가로 × 세로 × 높이(cm) ÷ 1,000,000 → 소수 6자리. 하나라도 비면 null
export function cbmOf(widthCm?: string | null, depthCm?: string | null, heightCm?: string | null) {
  const w = value(widthCm)
  const d = value(depthCm)
  const h = value(heightCm)
  if (w === null || d === null || h === null) return null
  // w·d·h는 각각 ×10⁶ → 곱은 cm³ × 10¹⁸. m³ = cm³ ÷ 10⁶이고 결과를 ×10⁶(고정 소수점)로 두면
  // m³ × 10⁶ = cm³ = 곱 ÷ 10¹⁸ (반올림) → 1cm³ = 0.000001 m³ 단위까지 정확
  const half = (SCALE * SCALE * SCALE) / 2n
  return fixed((w * d * h + half) / (SCALE * SCALE * SCALE), 6)
}

// 밀도(kg/m³)가 이 범위를 벗어나면 "단위 입력 오류 의심" (예: cm 대신 mm로 넣으면 체적이 1000배)
export const DENSITY_RANGE = { min: 10, max: 5000 }

// 경고 코드 (저장은 된다) — API 결과·화면 안내 공용
export type ItemWarning = { code: string; message: string; level?: UnitLevel }

export function densityWarning(
  level: UnitLevel,
  cbm: string | null,
  grossWeightKg: string | null | undefined,
): ItemWarning | null {
  const volume = value(cbm)
  const weight = value(grossWeightKg)
  if (volume === null || weight === null || volume === 0n) return null
  // kg/m³ (×10⁶): weight×10⁶ / volume×10⁶ → ×10⁶ 배 맞춤
  const density = (weight * SCALE) / volume
  if (density < BigInt(DENSITY_RANGE.min) * SCALE || density > BigInt(DENSITY_RANGE.max) * SCALE) {
    return {
      code: 'DENSITY_SUSPICIOUS',
      level,
      message: `${level} 밀도가 ${fixed(density, 0)}kg/m³입니다. 단위(cm·kg)를 확인해 주세요. (예: mm로 넣으면 체적이 1000배)`,
    }
  }
  return null
}

// ── 팔레트 계산 ──

export type PalletTypeSpec = {
  code: string
  widthCm: string
  depthCm: string
  heightCm: string
  weightKg: string
  maxLoadHeightCm: string | null
  maxLoadWeightKg: string | null
}

export type BoxSpec = {
  convQty: string
  heightCm?: string | null
  grossWeightKg?: string | null
}

export type PalletInput = {
  ti?: number | null
  hi?: number | null
  // TI·HI 없이 직접 넣은 팔레트당 박스 수 (TI·HI가 있으면 계산값이 우선)
  boxQty?: number | null
}

export type PalletResult = {
  boxQty: number
  // PLT 1개 = 기본단위 n개
  convQty: string
  widthCm: string | null
  depthCm: string | null
  heightCm: string | null
  grossWeightKg: string | null
  cbm: string | null
  warnings: ItemWarning[]
}

// 팔레트당 박스 수: TI × HI (둘 다 있을 때), 아니면 직접 넣은 값
export function palletBoxQty(input: PalletInput): number | null {
  if (input.ti && input.hi) return input.ti * input.hi
  return input.boxQty && input.boxQty > 0 ? input.boxQty : null
}

// PLT 행 계산: 환산수량 = 팔레트당 박스 수 × BOX 환산수량, 높이 = HI × BOX 높이 + 팔레트 높이,
// 가로·세로 = 팔레트 규격, 중량 = 박스 수 × BOX 총중량 + 팔레트 자체 중량. 권장 높이·중량을 넘으면 경고
// 팔레트 종류가 없으면 환산수량만 (규격·중량은 비움)
export function calcPallet(
  box: BoxSpec,
  pallet: PalletTypeSpec | null,
  input: PalletInput,
): PalletResult | null {
  const boxQty = palletBoxQty(input)
  if (!boxQty) return null
  const convQty = toBaseQty(String(boxQty), box.convQty)
  const warnings: ItemWarning[] = []
  const boxHeight = value(box.heightCm)
  const boxWeight = value(box.grossWeightKg)
  let heightCm: string | null = null
  let grossWeightKg: string | null = null
  if (pallet) {
    if (input.hi && boxHeight !== null) {
      const height = BigInt(input.hi) * boxHeight + parseQty(pallet.heightCm)
      heightCm = fixed(height, 2)
      const max = value(pallet.maxLoadHeightCm)
      if (max !== null && height > max) {
        warnings.push({
          code: 'PALLET_HEIGHT_EXCEEDED',
          level: 'PLT',
          message: `팔레트 높이 ${fixed(height, 1)}cm가 권장 ${fixed(max, 0)}cm를 넘습니다.`,
        })
      }
    }
    if (boxWeight !== null) {
      const weight = BigInt(boxQty) * boxWeight + parseQty(pallet.weightKg)
      grossWeightKg = fixed(weight, 3)
      const max = value(pallet.maxLoadWeightKg)
      if (max !== null && weight > max) {
        warnings.push({
          code: 'PALLET_WEIGHT_EXCEEDED',
          level: 'PLT',
          message: `팔레트 중량 ${fixed(weight, 1)}kg이 최대 ${fixed(max, 0)}kg를 넘습니다.`,
        })
      }
    }
  }
  const widthCm = pallet ? fixed(parseQty(pallet.widthCm), 2) : null
  const depthCm = pallet ? fixed(parseQty(pallet.depthCm), 2) : null
  return {
    boxQty,
    convQty,
    widthCm,
    depthCm,
    heightCm,
    grossWeightKg,
    cbm: cbmOf(widthCm, depthCm, heightCm),
    warnings,
  }
}

// ── 단위 사다리 검사 ──

export type LevelRow = { level: UnitLevel; unitCode: string; convQty: string }

// 상위 레벨 환산수량 > 하위 레벨 (BASE 1 < INNER < BOX < PLT). 어기면 오류 글, BOX가 INNER의 배수가 아니면 경고
export function checkUnitLadder(rows: LevelRow[]): { errors: string[]; warnings: ItemWarning[] } {
  const order: UnitLevel[] = ['BASE', 'INNER', 'BOX', 'PLT']
  const sorted = order.flatMap((level) => rows.filter((r) => r.level === level))
  const errors: string[] = []
  const warnings: ItemWarning[] = []
  for (let i = 1; i < sorted.length; i++) {
    const lower = sorted[i - 1]
    const upper = sorted[i]
    if (parseQty(upper.convQty) <= parseQty(lower.convQty)) {
      errors.push(
        `${upper.unitCode}(${upper.level}) 환산수량 ${upper.convQty}은 ${lower.unitCode}(${lower.level}) ${lower.convQty}보다 커야 합니다.`,
      )
    }
  }
  const inner = rows.find((r) => r.level === 'INNER')
  const box = rows.find((r) => r.level === 'BOX')
  if (inner && box && parseQty(box.convQty) % parseQty(inner.convQty) !== 0n) {
    warnings.push({
      code: 'UOM_NOT_MULTIPLE',
      level: 'BOX',
      message: `BOX 환산수량 ${box.convQty}이 INNER ${inner.convQty}의 배수가 아닙니다.`,
    })
  }
  return { errors, warnings }
}

// 최대 적층 박스 단수가 팔레트 단수(HI)보다 작으면 경고
export function stackWarning(maxStackBox: number | null, hi: number | null): ItemWarning | null {
  if (!maxStackBox || !hi || maxStackBox >= hi) return null
  return {
    code: 'STACK_LIMIT_CONFLICT',
    message: `최대 적층 ${maxStackBox}단보다 팔레트 단수(HI) ${hi}단이 많습니다.`,
  }
}

// ── 바코드 체크디지트 (GS1 mod 10) ──

const CHECK_DIGIT_LENGTH: Partial<Record<BarcodeType, number>> = {
  EAN13: 13,
  EAN8: 8,
  UPCA: 12,
  ITF14: 14,
}

// 마지막 자리 = 체크디지트. 오른쪽(체크디지트 앞)부터 3·1·3·1… 곱해 더한 값으로 계산
export function gs1CheckDigit(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i])
    sum += digit * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}

// 바코드 값 검사: 체크디지트 종류는 자리수·숫자·체크디지트, 나머지는 글자 모양만. 문제가 없으면 null
export function checkBarcode(type: BarcodeType, barcode: string): string | null {
  const length = CHECK_DIGIT_LENGTH[type]
  if (length) {
    if (!new RegExp(`^\\d{${length}}$`).test(barcode)) return `${type}은 숫자 ${length}자리입니다.`
    if (gs1CheckDigit(barcode.slice(0, -1)) !== Number(barcode.slice(-1))) {
      return `${type} 체크디지트가 맞지 않습니다.`
    }
    return null
  }
  if (!/^[\x21-\x7E]{1,50}$/.test(barcode))
    return '바코드는 공백 없는 영문·숫자·기호 50자 이하입니다.'
  return null
}

// 고정 소수점 글자 정리 (표시용): '2.000000' → '2'
export const trimQty = (text: string) => qtyText(parseQty(text))
