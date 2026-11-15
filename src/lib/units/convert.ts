// 단위 환산 공통 함수 (docs/decisions/0042, 0003 결정 3·6) — 화면·서버 공용, 순수 함수
// 재고는 항상 기본단위로 저장하고, 환산은 여기서만 한다 (CLAUDE.md)
//
// 수량은 글자로 주고받는다 (예: '2.5', DB Decimal의 toString()과 바로 맞물린다)
// 계산은 BigInt 고정 소수점: 수량 × 1,000,000 을 정수로 바꿔 계산해 소수 오차가 없다
// (기본단위 소수 최대 3자리 × 입수량 소수 최대 3자리 = 6자리까지 정확, 사용자 결정)

const SCALE_DIGITS = 6
const SCALE = 10n ** BigInt(SCALE_DIGITS)

// 수량 글자 → 고정 소수점 정수 ('2.5' → 2500000n). 음수 허용(재고 조정 등), 소수 6자리까지
export function parseQty(text: string): bigint {
  const value = text.trim()
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) throw new Error(`수량 형식이 아닙니다: '${text}'`)
  const [, sign, whole, fraction = ''] = match
  const trimmed = fraction.replace(/0+$/, '')
  if (trimmed.length > SCALE_DIGITS) {
    throw new Error(`수량은 소수 ${SCALE_DIGITS}자리까지입니다: '${text}'`)
  }
  const scaled = BigInt(whole) * SCALE + BigInt(trimmed.padEnd(SCALE_DIGITS, '0'))
  return sign === '-' ? -scaled : scaled
}

// 고정 소수점 정수 → 수량 글자 (끝의 0은 뺀다: 2500000n → '2.5', 72000000n → '72')
export function qtyText(scaled: bigint): string {
  const negative = scaled < 0n
  const abs = negative ? -scaled : scaled
  const whole = abs / SCALE
  const fraction = (abs % SCALE).toString().padStart(SCALE_DIGITS, '0').replace(/0+$/, '')
  const text = fraction ? `${whole}.${fraction}` : `${whole}`
  return negative && text !== '0' ? `-${text}` : text
}

// 입수량 검사: 0보다 커야 한다
function parseConvQty(convQty: string): bigint {
  const value = parseQty(convQty)
  if (value <= 0n) throw new Error(`입수량은 0보다 커야 합니다: '${convQty}'`)
  return value
}

// 환산단위 수량 → 기본단위 수량 (BOX 3개, 입수량 24 → '72')
export function toBaseQty(qty: string, convQty: string): string {
  const product = parseQty(qty) * parseConvQty(convQty)
  // 두 수 모두 SCALE배라 곱하면 SCALE²배 → 한 번 나눈다 (6자리를 넘는 소수는 정확히 나타낼 수 없어 거부)
  if (product % SCALE !== 0n) {
    throw new Error(`환산 결과가 소수 ${SCALE_DIGITS}자리를 넘습니다: ${qty} × ${convQty}`)
  }
  return qtyText(product / SCALE)
}

// 기본단위 수량 → 묶음 수 + 남는 기본단위 (3,000 EA, PLT 1,440 → { packs: '2', remainder: '120' })
export function splitBaseQty(baseQty: string, convQty: string) {
  const base = parseQty(baseQty)
  if (base < 0n) throw new Error(`나눌 수량은 0 이상이어야 합니다: '${baseQty}'`)
  const conv = parseConvQty(convQty)
  const packs = base / conv
  return { packs: packs.toString(), remainder: qtyText(base - packs * conv) }
}

export type QtyPart = { unit: string; qty: string }

// 기본단위 수량을 큰 단위부터 나눠 보여 주기 (3,000 EA, PLT 1,440·BOX 24 → 2 PLT · 5 BOX)
// 0인 단위는 빼고, 전부 0이면 기본단위 0 하나
export function breakdownQty(
  baseQty: string,
  units: readonly { unit: string; convQty: string }[],
  baseUnit: string,
): QtyPart[] {
  let rest = parseQty(baseQty)
  if (rest < 0n) throw new Error(`나눌 수량은 0 이상이어야 합니다: '${baseQty}'`)
  const parts: QtyPart[] = []
  const sorted = units
    .map((u) => ({ unit: u.unit, conv: parseConvQty(u.convQty) }))
    .sort((a, b) => (a.conv > b.conv ? -1 : a.conv < b.conv ? 1 : 0))
  for (const { unit, conv } of sorted) {
    const packs = rest / conv
    if (packs > 0n) {
      parts.push({ unit, qty: packs.toString() })
      rest -= packs * conv
    }
  }
  if (rest > 0n || parts.length === 0) parts.push({ unit: baseUnit, qty: qtyText(rest) })
  return parts
}

// 라벨 장수와 장마다 수량 (0003 결정 6): 라벨 단위 입수량으로 나누고 올림, 마지막 장은 나머지
// 3,000 EA, PLT 1,440 → ['1440', '1440', '120']
// maxLabels: 실수로 너무 많이 찍지 않게 (기본 1,000장)
export function labelQuantities(qty: string, convQty: string, maxLabels = 1000): string[] {
  const total = parseQty(qty)
  if (total <= 0n) return []
  const conv = parseConvQty(convQty)
  const full = total / conv
  const rest = total - full * conv
  const count = full + (rest > 0n ? 1n : 0n)
  if (count > BigInt(maxLabels)) {
    throw new Error(`라벨이 ${count.toString()}장으로 너무 많습니다 (최대 ${maxLabels}장)`)
  }
  const labels = Array.from({ length: Number(full) }, () => qtyText(conv))
  if (rest > 0n) labels.push(qtyText(rest))
  return labels
}

// 소수 자리 검사: 수량의 소수 자리(끝의 0 제외)가 단위의 소수 자리수 이하인지 (EA 0자리 → 2.5 불가)
export function checkQtyDecimals(qty: string, decimals: number): boolean {
  const fraction = qty.trim().split('.')[1] ?? ''
  return fraction.replace(/0+$/, '').length <= decimals
}

// 화면 표시: 천 단위 쉼표, 끝의 0 제거 ('1440.000' → '1,440', '2.500' → '2.5')
export function formatQty(qty: string | { toString(): string }): string {
  const text = qtyText(parseQty(qty.toString()))
  const [whole, fraction] = text.replace('-', '').split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${text.startsWith('-') ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`
}
