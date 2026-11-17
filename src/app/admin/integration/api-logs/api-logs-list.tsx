'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/common'
import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { API_CODE_LABELS, API_ENV, API_LOG_RESULT } from '@/lib/api/api-codes'
import type { ApiLogSummary } from '@/lib/api/api-log-queries'
import { listApiLogsAction } from './actions'

type Row = {
  id: string
  requestId: string
  shipper: string | null
  key: string | null
  env: string | null
  apiCode: string
  httpMethod: string
  path: string
  clientIp: string | null
  requestedAt: Date
  durationMs: number
  httpStatus: number
  result: string
  counts: string | null
  errorCode: string | null
}

const RESULT_FORMAT: StatusFormat = {
  SUCCESS: { label: '성공', tone: 'success' },
  PARTIAL: { label: '부분 성공', tone: 'warning' },
  FAIL: { label: '실패', tone: 'danger' },
}
const ENV_FORMAT: StatusFormat = {
  TEST: { label: 'TEST', tone: 'neutral' },
  LIVE: { label: 'LIVE', tone: 'info' },
}

const detailHref = (row: Row) => `/admin/integration/api-logs/${row.requestId}`

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'requestedAt',
    header: '요청 일시',
    accessor: 'requestedAt',
    format: 'datetime',
    sortable: true,
    hideable: false,
    pinned: true,
    href: detailHref,
  },
  { id: 'shipper', header: '화주사', accessor: 'shipper' },
  {
    id: 'apiCode',
    header: 'API 구분',
    accessor: (row) => API_CODE_LABELS[row.apiCode] ?? row.apiCode,
    sortable: true,
  },
  { id: 'env', header: '환경', accessor: 'env', format: { status: ENV_FORMAT } },
  {
    id: 'result',
    header: '결과',
    accessor: 'result',
    sortable: true,
    format: { status: RESULT_FORMAT },
  },
  // 등록 API만: 전체 / 성공 / 실패
  { id: 'counts', header: '전체/성공/실패', accessor: 'counts', align: 'center' },
  {
    id: 'durationMs',
    header: '처리 시간(ms)',
    accessor: 'durationMs',
    format: 'number',
    sortable: true,
  },
  { id: 'httpStatus', header: 'HTTP', accessor: 'httpStatus', align: 'center', sortable: true },
  { id: 'errorCode', header: '오류코드', accessor: 'errorCode' },
  { id: 'requestId', header: '요청ID', accessor: 'requestId' },
  { id: 'key', header: '키', accessor: 'key', defaultHidden: true },
  { id: 'clientIp', header: '호출 IP', accessor: 'clientIp', defaultHidden: true },
  {
    id: 'path',
    header: '경로',
    accessor: (row) => `${row.httpMethod} ${row.path}`,
    defaultHidden: true,
  },
]

// 상단 요약 (오늘): 호출 수 · 실패율 · 429 · 실패 많은 화주 (누르면 그 화주의 실패만)
function Summary({ summary }: { summary: ApiLogSummary }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        오늘 호출 <b className="text-foreground tabular-nums">{summary.total.toLocaleString()}</b>건
      </span>
      <span>
        · 실패율{' '}
        <b className={summary.failRate > 5 ? 'text-destructive' : 'text-foreground'}>
          {summary.failRate}%
        </b>
      </span>
      <span>
        · 호출 한도 초과(429) <b className="text-foreground tabular-nums">{summary.limited}</b>건
      </span>
      {summary.topFail.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          · 실패 많은 화주
          {summary.topFail.map((t) => (
            <Link
              key={t.shipperId}
              href={`/admin/integration/api-logs?shipper=${t.shipperId}&result=FAIL,PARTIAL`}
            >
              <StatusBadge tone="danger">
                {t.code} {t.count}
              </StatusBadge>
            </Link>
          ))}
        </span>
      )}
    </span>
  )
}

// 연동 > API 호출 이력 (0081 ②): 기간을 비우면 최근 7일
export function ApiLogsList({
  shippers,
  keys,
  summary,
  canExport,
}: {
  shippers: { id: string; code: string; name: string }[]
  keys: { id: string; name: string; keyPrefix: string; shipperCode: string }[]
  summary: ApiLogSummary | null
  canExport: boolean
}) {
  const fields: SearchFieldDef[] = [
    {
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    {
      key: 'requestedAt',
      label: '기간 (비우면 최근 7일)',
      type: 'dateRange',
      span: 6,
    },
    {
      key: 'apiCode',
      label: 'API 구분',
      type: 'multi',
      options: Object.entries(API_CODE_LABELS).map(([value, label]) => ({ value, label })),
    },
    { key: 'result', label: '결과', type: 'multi', options: API_LOG_RESULT.options },
    { key: 'env', label: '환경', type: 'multi', options: API_ENV.options, detail: true },
    {
      key: 'apiClient',
      label: '키',
      type: 'select',
      detail: true,
      options: keys.map((k) => ({
        value: k.id,
        label: `${k.shipperCode} · ${k.name} (${k.keyPrefix})`,
      })),
    },
    { key: 'requestId', label: '요청ID', type: 'text', detail: true, placeholder: 'req_…' },
    {
      key: 'docNo',
      label: '화주 문서번호',
      type: 'text',
      detail: true,
      placeholder: '주문번호·품목코드 등',
    },
    {
      key: 'errorCode',
      label: '오류코드',
      type: 'text',
      detail: true,
      placeholder: '예: RATE_LIMITED',
    },
    { key: 'httpStatus', label: 'HTTP 상태', type: 'text', detail: true, placeholder: '예: 401' },
  ]
  const list = useListQuery<Row>({
    gridId: 'integration-api-logs',
    fields,
    fetch: listApiLogsAction,
    defaultSort: [],
  })

  return (
    <MasterListPage
      title="API 호출 이력"
      description="화주 시스템이 부른 연동 API 요청입니다. 본문은 개인정보를 가려 저장하고 90일, 요약은 1년 보관합니다."
      meta={summary && <Summary summary={summary} />}
      gridId="integration-api-logs"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={detailHref}
      excelName={canExport ? 'API호출이력' : undefined}
      emptyTitle="호출 이력이 없습니다"
    />
  )
}
