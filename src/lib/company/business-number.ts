// 사업자등록번호 (10자리, 화면 표시는 000-00-00000) — 화면·서버 공용 순수 함수
// 마지막 자리는 검증번호: 앞 9자리에 가중치를 곱해 계산한다 (국세청 규칙)

const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5]

// 숫자만 남기기
export const digitsOnly = (value: string) => value.replace(/\D/g, '')

// 검증번호가 맞는지 (형식이 10자리 숫자가 아니면 false)
export function isValidBusinessNumber(value: string) {
  const digits = digitsOnly(value)
  if (!/^\d{10}$/.test(digits) || value.replace(/[\d\s-]/g, '') !== '') return false
  const d = [...digits].map(Number)
  let sum = WEIGHTS.reduce((acc, weight, i) => acc + d[i] * weight, 0)
  // 9번째 자리 × 5의 십의 자리를 한 번 더 더한다
  sum += Math.floor((d[8] * 5) / 10)
  return (10 - (sum % 10)) % 10 === d[9]
}

// 000-00-00000 모양으로 (10자리가 아니면 입력 그대로)
export function formatBusinessNumber(value: string) {
  const digits = digitsOnly(value)
  if (digits.length !== 10) return value
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}
