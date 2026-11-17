'use client'

import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, useListQuery, type SearchFieldDef } from '@/components/master-list'
import { API_ENV, API_KEY_STATUS } from '@/lib/api/api-codes'
import { listApiKeysAction } from './actions'

type Row = {
  id: string
  shipperId: string
  shipper: string
  name: string
  env: string
  key: string
  status: string
  scopes: string[]
  ipCount: number
  rateLimitPerMin: number
  expiresAt: Date | null
  lastUsedAt: Date | null
  lastUsedIp: string | null
  issuedAt: Date
  issuedBy: string
}

const ENV_FORMAT: StatusFormat = {
  TEST: { label: 'TEST', tone: 'neutral' },
  LIVE: { label: 'LIVE', tone: 'info' },
}
const STATUS_FORMAT: StatusFormat = {
  ACTIVE: { label: '사용 중', tone: 'success' },
  REVOKED: { label: '폐기', tone: 'danger' },
  EXPIRED: { label: '만료', tone: 'neutral' },
}

const shipperHref = (row: Row) => `/admin/master/shippers/${row.shipperId}#section-api-keys`

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: 'shipper',
    header: '화주사',
    accessor: 'shipper',
    sortable: true,
    hideable: false,
    pinned: true,
    href: shipperHref,
  },
  { id: 'name', header: '키 이름', accessor: 'name', sortable: true, hideable: false },
  { id: 'env', header: '환경', accessor: 'env', sortable: true, format: { status: ENV_FORMAT } },
  { id: 'key', header: '키 식별부', accessor: 'key' },
  { id: 'scopes', header: '권한', accessor: (row) => `${row.scopes.length}개`, align: 'center' },
  {
    id: 'ipCount',
    header: '허용 IP',
    accessor: (row) => (row.ipCount === 0 ? '전체' : `${row.ipCount}개`),
    align: 'center',
  },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    sortable: true,
    format: { status: STATUS_FORMAT },
  },
  { id: 'expiresAt', header: '만료일', accessor: 'expiresAt', format: 'date', sortable: true },
  {
    id: 'lastUsedAt',
    header: '최근 사용',
    accessor: 'lastUsedAt',
    format: 'datetime',
    sortable: true,
  },
  { id: 'lastUsedIp', header: '최근 IP', accessor: 'lastUsedIp', defaultHidden: true },
  {
    id: 'rateLimitPerMin',
    header: '분당 한도',
    accessor: 'rateLimitPerMin',
    format: 'number',
    defaultHidden: true,
  },
  { id: 'issuedAt', header: '발급일', accessor: 'issuedAt', format: 'date', sortable: true },
  { id: 'issuedBy', header: '발급자', accessor: 'issuedBy', defaultHidden: true },
]

// 연동 > API 키 (0081): 모든 화주의 키를 한눈에 (만료 예정 찾기). 발급·수정·폐기는 화주사 편집 화면의 "API 키" 섹션에서
export function ApiKeysList({
  shippers,
}: {
  shippers: { id: string; code: string; name: string }[]
}) {
  const fields: SearchFieldDef[] = [
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 4,
      placeholder: '화주사 코드·화주사명·키 이름·키 식별부',
    },
    {
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    { key: 'status', label: '상태', type: 'multi', options: API_KEY_STATUS.options },
    { key: 'env', label: '환경', type: 'multi', options: API_ENV.options, detail: true },
    {
      key: 'expiring',
      label: '만료 예정(14일 안)',
      type: 'yn',
      ynLabels: ['만료 예정만', '전체'],
      detail: true,
    },
  ]
  const list = useListQuery<Row>({
    gridId: 'integration-api-keys',
    fields,
    fetch: listApiKeysAction,
    defaultSort: [],
  })

  return (
    <MasterListPage
      title="API 키"
      description="화주 시스템이 연동 API를 부를 때 쓰는 키입니다. 발급·수정·폐기는 화주사 편집 화면의 API 키 섹션에서 합니다."
      gridId="integration-api-keys"
      searchFields={fields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={shipperHref}
      emptyTitle="발급한 API 키가 없습니다"
    />
  )
}
