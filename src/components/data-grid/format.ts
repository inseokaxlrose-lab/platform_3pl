// 셀 서식 함수: 값이 없으면 null을 돌려주고, 화면에서 '-'로 표시한다

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/
const TIME_ZONE = 'Asia/Seoul'

// 정수 부분에 천 단위 쉼표 넣기: '1234567' → '1,234,567'
function groupThousands(integer: string) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 숫자 서식
// - 재고 수량(Decimal)은 DB에서 '12345.500' 같은 문자열로 온다.
//   number로 바꾸면 큰 값·소수에서 오차가 생길 수 있으므로 문자열 그대로 쉼표만 넣는다
// - 소수점 아래 끝의 0은 지운다 ('12.500' → '12.5'). 반올림은 하지 않는다 (값을 바꾸지 않기 위해)
export function formatNumber(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    text = String(value)
    // 아주 크거나 작은 수는 지수 표기(1e+21)가 되므로 Intl에 맡긴다
    if (text.includes('e')) {
      return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 20 }).format(value)
    }
  } else if (typeof value === 'string' || typeof value === 'bigint') {
    text = String(value).trim()
  } else {
    // Prisma Decimal 객체 등은 toString()이 정확한 값을 준다
    text = String(value)
  }

  const match = DECIMAL_PATTERN.exec(text)
  if (!match) return text // 숫자가 아니면 그대로 보여준다

  const [, sign, integer, fraction = ''] = match
  const trimmedFraction = fraction.replace(/0+$/, '')
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '')
  const isZero = /^0*$/.test(normalizedInteger) && trimmedFraction === ''

  return (
    (isZero ? '' : sign) +
    groupThousands(normalizedInteger) +
    (trimmedFraction ? `.${trimmedFraction}` : '')
  )
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// 한국 시간 기준 날짜 조각 꺼내기
function toSeoulParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

// 날짜 서식: '2026-11-13' / withTime이면 '2026-11-13 14:05' (한국 시간 기준)
export function formatDate(value: unknown, withTime = false): string | null {
  if (value === null || value === undefined || value === '') return null

  // 시간 없는 날짜 문자열은 시간대 변환 없이 그대로 쓴다 (변환하면 하루 밀릴 수 있음)
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    return withTime ? `${value} 00:00` : value
  }

  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)

  const parts = toSeoulParts(date)
  return withTime ? `${parts.date} ${parts.time}` : parts.date
}
