import { digitsOnly, hasOnlyDigitsAndSeparators } from './digits'

// 전화·팩스·휴대폰 번호 — 화면·서버 공용 순수 함수
// 저장: 숫자만 '021234567' / 표시: '02-123-4567'
// 지원: 서울(02), 지역·휴대폰·인터넷전화(0xx), 평생번호(050x), 대표번호(15xx·16xx·18xx)

const MAX_DIGITS = 12

// 가운데·끝 자리로 나누기: 가운데는 남은 자리가 8개면 4자리, 그보다 적으면 3자리
function splitRest(rest: string) {
  if (rest.length <= 3) return [rest]
  const middle = rest.length >= 8 ? 4 : 3
  return [rest.slice(0, middle), rest.slice(middle)]
}

// 하이픈을 넣은 모양으로. 입력 중인 짧은 값도 자리까지만 끊어 보여준다
export function formatPhone(value: string) {
  const d = digitsOnly(value).slice(0, MAX_DIGITS)
  // 대표번호: 1588-1234
  if (d.startsWith('1')) return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4, 8)}`
  // 앞자리(국번) 길이: 02는 2자리, 050x는 4자리, 나머지 0xx는 3자리
  const areaLength = d.startsWith('02') ? 2 : d.startsWith('050') ? 4 : 3
  if (d.length <= areaLength) return d
  return [d.slice(0, areaLength), ...splitRest(d.slice(areaLength))].join('-')
}

// 번호로 쓸 수 있는 모양인지 (숫자·하이픈·띄어쓰기만, 앞자리별 자릿수)
export function isValidPhone(value: string) {
  if (!hasOnlyDigitsAndSeparators(value)) return false
  const d = digitsOnly(value)
  if (/^1[568]\d{6}$/.test(d)) return true
  if (d.startsWith('02')) return d.length === 9 || d.length === 10
  if (d.startsWith('050')) return d.length === 11 || d.length === 12
  return /^0[1-9]\d{8,9}$/.test(d)
}
