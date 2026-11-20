import type { InvoiceCheckRule } from './carrier-codes'

// 송장번호 계산·검사 (docs/decisions/0094) — 화면·서버 공용, 숫자는 글자로 다룬다 (자릿수가 커서 Number를 쓰지 않음)
// - 본번호: 체크디지트를 뺀 앞자리 (계약의 송장 대역은 본번호로 적는다)
// - 송장번호: 본번호 + 체크디지트 (규칙이 NONE이면 본번호 그대로)

const DIGITS = /^\d+$/

// 체크디지트를 붙이는 규칙인지
export const hasCheckDigit = (rule: InvoiceCheckRule) => rule !== 'NONE'

// 본번호의 자릿수 (송장번호 자릿수에서 체크디지트 한 자리를 뺀다)
export function bodyDigitsOf(invoiceDigits: number | null, rule: InvoiceCheckRule) {
  if (invoiceDigits === null) return null
  return hasCheckDigit(rule) ? invoiceDigits - 1 : invoiceDigits
}

// 본번호 → 체크디지트 한 자리 (규칙이 NONE이면 빈 글자)
export function checkDigitOf(body: string, rule: InvoiceCheckRule): string {
  if (!DIGITS.test(body)) throw new Error(`숫자가 아닌 본번호입니다: ${body}`)
  switch (rule) {
    case 'NONE':
      return ''
    case 'MOD7':
      return String(BigInt(body) % 7n)
  }
}

// 본번호 → 송장번호
export const invoiceNoOf = (body: string, rule: InvoiceCheckRule) => body + checkDigitOf(body, rule)

// 송장번호가 운송사 규칙(자릿수·체크디지트)에 맞는지
export function isValidInvoiceNo(
  invoiceNo: string,
  carrier: { invoiceDigits: number | null; invoiceCheck: InvoiceCheckRule },
) {
  if (!DIGITS.test(invoiceNo)) return false
  if (carrier.invoiceDigits !== null && invoiceNo.length !== carrier.invoiceDigits) return false
  if (!hasCheckDigit(carrier.invoiceCheck)) return true
  if (invoiceNo.length < 2) return false
  const body = invoiceNo.slice(0, -1)
  return checkDigitOf(body, carrier.invoiceCheck) === invoiceNo.slice(-1)
}

// 본번호 비교 (자릿수가 같다고 보고 BigInt로)
export const compareBody = (a: string, b: string) => {
  const x = BigInt(a)
  const y = BigInt(b)
  return x < y ? -1 : x > y ? 1 : 0
}

// 대역에 남은 송장 수 (다음 번호 ~ 끝 번호, 다 쓰면 0)
export function remainingInvoices(range: { next: string; end: string }) {
  const left = BigInt(range.end) - BigInt(range.next) + 1n
  return left > 0n ? left.toString() : '0'
}

// 배송 조회 주소: {invoiceNo}를 송장번호로 바꾼다 (주소가 없으면 null)
export function trackingUrlOf(template: string | null, invoiceNo: string) {
  if (!template) return null
  return template.replaceAll('{invoiceNo}', encodeURIComponent(invoiceNo))
}
