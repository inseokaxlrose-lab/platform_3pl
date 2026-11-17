import 'server-only'
import { codesFilter, dateRangeFilter, idFilter, textFilter } from '@/lib/grid/list-filters'

// API 호출 이력 검색 조건 (docs/decisions/0081 ②) — 목록 화면 searchFields와 같은 키
// 기본: shipper · requestedAt(기간) · apiCode(여러 개) · result(여러 개)
// 상세: env · apiClient(키) · requestId · docNo(화주 문서번호) · errorCode · httpStatus
// 기간을 비우면 최근 7일 (로그가 많아 전체 기간을 한 번에 보지 않는다)

type Filters = Record<string, string>
const DAY = 86_400_000

export const DEFAULT_LOG_DAYS = 7

export function apiLogWhere(filters: Filters, now = new Date()) {
  const requestedAt = dateRangeFilter(filters, 'requestedAt') ?? {
    gte: new Date(now.getTime() - DEFAULT_LOG_DAYS * DAY),
  }
  const shipper = idFilter(filters, 'shipper')
  const apiClient = idFilter(filters, 'apiClient')
  const requestId = textFilter(filters, 'requestId')
  const docNo = filters.docNo?.trim()
  const errorCode = filters.errorCode?.trim().toUpperCase()
  const httpStatus = Number(filters.httpStatus)
  return {
    AND: [
      { requestedAt },
      shipper ? { shipperId: shipper } : {},
      apiClient ? { apiClientId: apiClient } : {},
      codesFilter(filters, 'apiCode') ? { apiCode: codesFilter(filters, 'apiCode') } : {},
      codesFilter(filters, 'result') ? { result: codesFilter(filters, 'result') } : {},
      codesFilter(filters, 'env') ? { env: codesFilter(filters, 'env') } : {},
      requestId ? { requestId } : {},
      docNo
        ? { items: { some: { extDocNo: { contains: docNo, mode: 'insensitive' as const } } } }
        : {},
      // 대표 오류코드 또는 건별 오류코드
      errorCode ? { OR: [{ errorCode }, { items: { some: { errorCode } } }] } : {},
      Number.isInteger(httpStatus) && httpStatus >= 100 ? { httpStatus } : {},
    ],
  }
}
