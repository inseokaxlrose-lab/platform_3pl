import 'server-only'
import { toPrismaQuery, type ListQuery } from '@/lib/grid/grid-query'
import { codesFilter, dateRangeFilter, idFilter } from '@/lib/grid/list-filters'
import { prisma } from '@/lib/prisma'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { parseQty } from '@/lib/units/convert'
import { ASN_SCOPE } from './asns'

// ASN 목록 (docs/decisions/0051) — 운영사 화면·화주 포털 공용, 서버 액션에서 부른다
// 한 행 = ASN 하나. 라인 진행은 줄 수로 요약한다 (품목마다 단위가 달라 수량을 더하지 않는다)
// 검색 조건 키: keyword · shipper · center · status(여러 개) · putaway(여러 개) · channel · expectedOn · createdAt

const ASN_STATUSES = ['PLANNED', 'INSPECTING', 'PARTIAL', 'COMPLETED', 'CLOSED'] as const
const PUTAWAY_STATUSES = ['WAITING', 'PARTIAL', 'DONE'] as const
const CHANNELS = ['PORTAL', 'PROXY', 'EXCEL', 'API'] as const

// 여러 값 조건 중 정해진 값만 (엉뚱한 값이 enum 조건에 들어가 오류 나지 않게)
function enumFilter<T extends string>(
  filters: Record<string, string>,
  key: string,
  allowed: readonly T[],
) {
  const values = (codesFilter(filters, key)?.in ?? []).filter((v): v is T =>
    (allowed as readonly string[]).includes(v),
  )
  return values.length > 0 ? { in: values } : undefined
}

// 날짜만 있는 칸(예정일)의 기간 조건: 한국 날짜를 그대로 UTC 자정으로
function dateOnlyRange(filters: Record<string, string>, key: string) {
  const [from = '', to = ''] = (filters[key] ?? '').split('~')
  const range: { gte?: Date; lte?: Date } = {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) range.gte = new Date(`${from}T00:00:00.000Z`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) range.lte = new Date(`${to}T00:00:00.000Z`)
  return range.gte || range.lte ? range : undefined
}

export async function listAsns(input: ListQuery, scope: DataScope) {
  const { filters } = input
  const query = toPrismaQuery(input, {
    searchFields: ['asnNo', 'shipperRefNo', 'shipper.name', 'shipper.code'],
    sortable: {
      asnNo: 'asnNo',
      expectedOn: 'expectedOn',
      shipper: 'shipper.code',
      center: 'center.code',
      status: 'status',
      putawayStatus: 'putawayStatus',
      createdAt: 'createdAt',
    },
    defaultOrderBy: { createdAt: 'desc' },
  })
  const status = enumFilter(filters, 'status', ASN_STATUSES)
  const putaway = enumFilter(filters, 'putaway', PUTAWAY_STATUSES)
  const channel = enumFilter(filters, 'channel', CHANNELS)
  const expectedOn = dateOnlyRange(filters, 'expectedOn')
  const createdAt = dateRangeFilter(filters, 'createdAt')
  const where = {
    AND: [
      query.where,
      scopeFilter(scope, ASN_SCOPE),
      idFilter(filters, 'shipper') ? { shipperId: idFilter(filters, 'shipper') } : {},
      idFilter(filters, 'center') ? { centerId: idFilter(filters, 'center') } : {},
      status ? { status } : {},
      putaway ? { putawayStatus: putaway } : {},
      channel ? { channel } : {},
      expectedOn ? { expectedOn } : {},
      createdAt ? { createdAt } : {},
    ],
  }
  const [rows, rowCount] = await prisma.$transaction([
    prisma.asn.findMany({
      ...query,
      where,
      select: {
        id: true,
        asnNo: true,
        type: true,
        channel: true,
        expectedOn: true,
        shipperRefNo: true,
        status: true,
        putawayStatus: true,
        createdBy: true,
        createdAt: true,
        shipper: { select: { code: true, name: true } },
        center: { select: { code: true, name: true } },
        // 공급처 (0090)
        supplier: { select: { code: true, name: true } },
        lines: {
          select: { expectedQty: true, confirmedQty: true, closedQty: true },
        },
      },
    }),
    prisma.asn.count({ where }),
  ])
  return {
    rows: rows.map(({ shipper, center, supplier, lines, ...row }) => {
      const remaining = lines.filter(
        (l) =>
          parseQty(l.expectedQty.toString()) >
          parseQty(l.confirmedQty.toString()) + parseQty(l.closedQty.toString()),
      ).length
      const over = lines.filter(
        (l) => parseQty(l.confirmedQty.toString()) > parseQty(l.expectedQty.toString()),
      ).length
      return {
        ...row,
        expectedOn: row.expectedOn.toISOString().slice(0, 10),
        shipper: `${shipper.name} (${shipper.code})`,
        center: `${center.name} (${center.code})`,
        supplier: supplier ? `${supplier.name} (${supplier.code})` : null,
        lineCount: lines.length,
        // 잔량이 남은 줄 / 예정보다 많이 받은 줄
        remainingLines: remaining,
        overLines: over,
      }
    }),
    rowCount,
  }
}
