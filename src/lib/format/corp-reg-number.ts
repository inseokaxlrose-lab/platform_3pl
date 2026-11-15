import { digitsOnly, hasOnlyDigitsAndSeparators } from './digits'

// 법인등록번호 (13자리) — 화면·서버 공용 순수 함수
// 저장: 숫자만 / 표시: '000000-0000000'
// 마지막 자리는 검증번호: 앞 12자리에 1,2,1,2… 가중치를 곱해 더한 값으로 계산한다

export function isValidCorpRegNumber(value: string) {
  const digits = digitsOnly(value)
  if (!/^\d{13}$/.test(digits) || !hasOnlyDigitsAndSeparators(value)) return false
  const d = [...digits].map(Number)
  const sum = d.slice(0, 12).reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 2), 0)
  return (10 - (sum % 10)) % 10 === d[12]
}

// 000000-0000000 모양으로 (입력 중인 짧은 값도)
export function formatCorpRegNumber(value: string) {
  const d = digitsOnly(value).slice(0, 13)
  return d.length <= 6 ? d : `${d.slice(0, 6)}-${d.slice(6)}`
}
