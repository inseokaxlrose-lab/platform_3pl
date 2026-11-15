import { digitsOnly } from '@/lib/format'
import { parseId } from '@/lib/id'
import { STATUS, type Status } from '@/lib/status'
import type { Yn } from '@/lib/yn'

// 목록 검색 조건 해석 (서버 공용 순수 함수)
// 화면의 조건 값은 모두 글자라서(URL과 같은 모양) 서버에서 이 함수들로 Prisma 조건으로 바꾼다
// 값이 비었거나 형식이 틀리면 undefined → 그 조건은 걸지 않는다

type Filters = Record<string, string | undefined>

// 글자 (앞뒤 공백 제거, 부분 일치·대소문자 무시)
export function textFilter(filters: Filters, key: string) {
  const value = filters[key]?.trim()
  return value ? { contains: value, mode: 'insensitive' as const } : undefined
}

// 번호(사업자번호·전화): 하이픈을 넣어 찾아도 숫자로 바꿔 부분 일치 (DB는 숫자만, 0029)
export function digitsFilter(filters: Filters, key: string) {
  const value = digitsOnly(filters[key] ?? '')
  return value ? { contains: value } : undefined
}

// 키 (센터·창고 고르기 등): 글자 → bigint ('12' → 12n). 숫자 모양이 아니면 조건 없음
export function idFilter(filters: Filters, key: string) {
  return parseId(filters[key]?.trim()) ?? undefined
}

// 여러 코드 중 하나 ('A,B' → { in: ['A','B'] })
export function codesFilter(filters: Filters, key: string) {
  const codes = (filters[key] ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
  return codes.length > 0 ? { in: codes } : undefined
}

// 상태 (기준정보 공통 status_cd): 'ACTIVE'·'INACTIVE'만 조건으로, 그 밖(전체) → 조건 없음
// where의 AND 목록에 그대로 넣는다: AND: [query.where, statusWhere(filters), …]
export function statusWhere(filters: Filters): { status?: Status } {
  const value = filters.status
  return value === STATUS.ACTIVE || value === STATUS.INACTIVE ? { status: value } : {}
}

// 예/아니오 칸(_yn, DB에 'Y'/'N'): 'Y'·'N'만 조건으로, 그 밖 → 조건 없음
export function ynFilter(filters: Filters, key: string): Yn | undefined {
  const value = filters[key]
  return value === 'Y' || value === 'N' ? value : undefined
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

// 기간 ('2026-11-01~2026-11-30', 한쪽만 있어도 됨) → 한국 날짜 기준 { gte, lt }
// 종료일은 그날 하루 전체를 포함한다 (다음 날 0시 전까지)
export function dateRangeFilter(filters: Filters, key: string) {
  const [from = '', to = ''] = (filters[key] ?? '').split('~')
  const range: { gte?: Date; lt?: Date } = {}
  if (DATE.test(from)) range.gte = new Date(`${from}T00:00:00+09:00`)
  if (DATE.test(to)) {
    const end = new Date(`${to}T00:00:00+09:00`)
    end.setUTCDate(end.getUTCDate() + 1)
    range.lt = end
  }
  return range.gte || range.lt ? range : undefined
}

// 숫자 범위 ('10~100', 한쪽만 있어도 됨) → { gte, lte }
export function numberRangeFilter(filters: Filters, key: string) {
  const [min = '', max = ''] = (filters[key] ?? '').split('~')
  const range: { gte?: number; lte?: number } = {}
  if (min.trim() !== '' && !Number.isNaN(Number(min))) range.gte = Number(min)
  if (max.trim() !== '' && !Number.isNaN(Number(max))) range.lte = Number(max)
  return range.gte !== undefined || range.lte !== undefined ? range : undefined
}
