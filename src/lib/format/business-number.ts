import { digitsOnly, hasOnlyDigitsAndSeparators } from './digits'

// 사업자등록번호 (10자리) — 화면·서버 공용 순수 함수
// 저장: 숫자만 '1234567891' / 표시: '123-45-67891'
// 마지막 자리는 검증번호: 앞 9자리에 가중치를 곱해 계산한다 (국세청 규칙)

const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5]

// 검증번호가 맞는지 (10자리 숫자가 아니면 false)
export function isValidBusinessNumber(value: string) {
  const digits = digitsOnly(value)
  if (!/^\d{10}$/.test(digits) || !hasOnlyDigitsAndSeparators(value)) return false
  const d = [...digits].map(Number)
  let sum = WEIGHTS.reduce((acc, weight, i) => acc + d[i] * weight, 0)
  // 9번째 자리 × 5의 십의 자리를 한 번 더 더한다
  sum += Math.floor((d[8] * 5) / 10)
  return (10 - (sum % 10)) % 10 === d[9]
}

// 000-00-00000 모양으로. 입력 중인 짧은 값도 자리까지만 끊어 보여준다 (예: '1234' → '123-4')
export function formatBusinessNumber(value: string) {
  const d = digitsOnly(value).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}
