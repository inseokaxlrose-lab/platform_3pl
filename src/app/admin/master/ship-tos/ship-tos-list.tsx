'use client'

import { MapPinnedIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import {
  CENTER_ASSIGN_STATUS,
  CENTER_ASSIGN_STATUS_BADGE,
  CENTER_ASSIGN_TYPE,
  CENTER_CONFIRM_REASON,
  DATA_SOURCE,
  SHIP_TO_STATUS,
} from '@/lib/customers/customer-codes'
import { ADDR_GRADE } from '@/lib/regions/region-codes'
import { listShipTosAction, reassignShipTosAutoAction, renormalizeShipTosAction } from './actions'
import { ShipToCenterDialog } from './ship-to-center-dialog'

type Row = {
  id: string
  code: string
  name: string
  isDefault: string
  status: string
  address: string
  sigunguName: string | null
  addressGrade: string
  centerAssignType: string | null
  centerAssignStatus: string
  centerConfirmReason: string | null
  regionMismatchYn: string
  source: string
  updatedAt: Date
  customerId: string
  shipper: string
  customerCode: string
  customerName: string
  deliveryCenter: string | null
  regionCenter: string | null
  route: string | null
}

const SHIP_TO_STATUS_BADGE: StatusFormat = {
  ACTIVE: { label: '사용', tone: 'success' },
  INACTIVE: { label: '사용 중지', tone: 'neutral' },
}
const label = <T extends { labels: Record<string, string> }>(set: T, value: string | null) =>
  value ? (set.labels[value] ?? value) : null

// 납품처를 누르면 그 거래처 수정 화면의 납품처 섹션으로 (편집 규칙은 거래처 화면 한 곳에서, 0082)
const customerHref = (row: Row) => `/admin/master/customers/${row.customerId}#section-ship-to`

const COLUMNS: DataGridColumn<Row>[] = [
  { id: 'shipper', header: '화주사', accessor: 'shipper', sortable: true, pinned: true },
  {
    id: 'customerCode',
    header: '거래처코드',
    accessor: 'customerCode',
    sortable: true,
    pinned: true,
    href: customerHref,
  },
  { id: 'customerName', header: '거래처명', accessor: 'customerName' },
  {
    id: 'code',
    header: '납품처코드',
    accessor: 'code',
    sortable: true,
    hideable: false,
    href: customerHref,
  },
  { id: 'name', header: '납품처명', accessor: 'name', sortable: true },
  {
    id: 'isDefault',
    header: '기본',
    accessor: 'isDefault',
    cell: (row) => (row.isDefault === 'Y' ? <StatusBadge tone="info">기본</StatusBadge> : ''),
  },
  { id: 'address', header: '주소', accessor: 'address' },
  { id: 'sigunguName', header: '시군구', accessor: 'sigunguName', defaultHidden: true },
  { id: 'addressGrade', header: '정제 등급', accessor: 'addressGrade', sortable: true },
  { id: 'deliveryCenter', header: '배송센터', accessor: 'deliveryCenter', sortable: true },
  { id: 'regionCenter', header: '권역 기준 센터', accessor: 'regionCenter' },
  // 배송 코스 (0095): 직접 지정이면 '· 지정', 아니면 우편번호 배정
  { id: 'route', header: '배송 코스', accessor: 'route' },
  {
    id: 'centerAssignType',
    header: '지정 구분',
    accessor: (row) => label(CENTER_ASSIGN_TYPE, row.centerAssignType) ?? '-',
  },
  {
    id: 'centerAssignStatus',
    header: '지정 상태',
    accessor: 'centerAssignStatus',
    sortable: true,
    format: { status: CENTER_ASSIGN_STATUS_BADGE },
  },
  {
    id: 'centerConfirmReason',
    header: '확인 필요 사유',
    accessor: (row) => label(CENTER_CONFIRM_REASON, row.centerConfirmReason) ?? '',
  },
  {
    id: 'regionMismatchYn',
    header: '권역 불일치',
    accessor: 'regionMismatchYn',
    cell: (row) =>
      row.regionMismatchYn === 'Y' ? (
        <span className="inline-flex items-center gap-1 text-warning">
          <TriangleAlertIcon className="size-3.5" />
          불일치
        </span>
      ) : (
        ''
      ),
  },
  {
    id: 'status',
    header: '상태',
    accessor: 'status',
    format: { status: SHIP_TO_STATUS_BADGE },
  },
  {
    id: 'source',
    header: '등록 경로',
    accessor: (row) => label(DATA_SOURCE, row.source) ?? '',
    defaultHidden: true,
  },
  {
    id: 'updatedAt',
    header: '수정일시',
    accessor: 'updatedAt',
    format: 'datetime',
    sortable: true,
    defaultHidden: true,
  },
]

type Center = { id: string; code: string; name: string }

// 납품처 목록 (docs/decisions/0082 ②): 배송센터 "확인 필요"·"권역 불일치"를 모아 처리한다
export function ShipTosList({
  shippers,
  centers,
  can,
}: {
  shippers: { id: string; code: string; name: string }[]
  // 배송센터 거르기·일괄 지정에 고를 센터 (범위 안 화주들이 이용하는 센터)
  centers: Center[]
  can: { update: boolean; export: boolean }
}) {
  // 일괄 처리 결과 (목록 위 도구줄에 보인다)
  const [result, setResult] = useState<string | null>(null)
  const searchFields: SearchFieldDef[] = [
    {
      key: 'view',
      label: '빠른 보기',
      type: 'segment',
      span: 6,
      options: [
        { value: 'NEED_CONFIRM', label: '확인 필요' },
        { value: 'MISMATCH', label: '권역 불일치' },
        { value: 'LOW_GRADE', label: '정제 등급 C 이하' },
      ],
    },
    {
      key: 'keyword',
      label: '검색어',
      type: 'keyword',
      span: 6,
      placeholder: '거래처·납품처 코드·명',
    },
    {
      key: 'shipper',
      label: '화주사',
      type: 'select',
      options: shippers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    },
    {
      key: 'center',
      label: '배송센터',
      type: 'select',
      options: centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    },
    {
      key: 'assignStatus',
      label: '지정 상태',
      type: 'multi',
      options: CENTER_ASSIGN_STATUS.options,
    },
    {
      key: 'assignType',
      label: '지정 구분',
      type: 'multi',
      options: CENTER_ASSIGN_TYPE.options,
      detail: true,
    },
    {
      key: 'reason',
      label: '확인 필요 사유',
      type: 'multi',
      options: CENTER_CONFIRM_REASON.options,
      detail: true,
    },
    { key: 'mismatch', label: '권역 불일치', type: 'yn', detail: true },
    {
      key: 'grade',
      label: '정제 등급',
      type: 'multi',
      options: ADDR_GRADE.options.map((o) => ({ value: o.value, label: `${o.value} ${o.label}` })),
      detail: true,
    },
    { key: 'sigungu', label: '시군구', type: 'text', placeholder: '예: 강남구', detail: true },
    {
      key: 'source',
      label: '등록 경로',
      type: 'multi',
      options: DATA_SOURCE.options,
      detail: true,
    },
    {
      key: 'status',
      label: '납품처 상태',
      type: 'multi',
      options: SHIP_TO_STATUS.options,
      detail: true,
    },
  ]
  const list = useListQuery<Row>({
    gridId: 'master-ship-tos',
    fields: searchFields,
    fetch: listShipTosAction,
  })

  // 결과 글: 'n곳 처리 — 지정 완료 a · 확인 필요 b · 건너뜀 c'
  const report = (r: {
    total: number
    assigned: number
    needConfirm: number
    skipped: { code: string; customerCode: string }[]
  }) => {
    const skipped =
      r.skipped.length > 0
        ? ` · 건너뜀 ${r.skipped.length} (화주 이용 센터가 아님: ${r.skipped
            .slice(0, 5)
            .map((s) => `${s.customerCode}/${s.code}`)
            .join(', ')}${r.skipped.length > 5 ? ' …' : ''})`
        : ''
    setResult(`${r.total}곳 처리 — 지정 완료 ${r.assigned} · 확인 필요 ${r.needConfirm}${skipped}`)
  }

  const confirmButton = (ids: string[], done: () => void, kind: 'auto' | 'renormalize') => (
    <ConfirmDialog
      key={kind}
      trigger={
        <Button type="button" variant="outline" disabled={ids.length === 0}>
          <RefreshCwIcon />
          {kind === 'auto' ? '권역 기준으로 재지정' : '재정제'}
          {ids.length > 0 && ` (${ids.length})`}
        </Button>
      }
      title={
        kind === 'auto'
          ? `납품처 ${ids.length}곳을 권역 기준으로 다시 정할까요?`
          : `납품처 ${ids.length}곳의 주소를 다시 정제할까요?`
      }
      description={
        kind === 'auto'
          ? '수동·연동으로 지정한 센터도 버리고, 주소로 권역설정을 찾아 "권역 자동"으로 정합니다. 못 정하면 "확인 필요"가 됩니다.'
          : '저장해 둔 정제 결과를 쓰지 않고 주소를 다시 찾습니다. 권역 자동 납품처는 배송센터도 다시 정하고, 수동·연동 지정은 센터를 그대로 두고 권역 불일치만 새로 봅니다.'
      }
      confirmLabel={kind === 'auto' ? '재지정' : '재정제'}
      onConfirm={async () => {
        const action = kind === 'auto' ? reassignShipTosAutoAction : renormalizeShipTosAction
        report(unwrap(await action({ ids })))
        done()
      }}
    />
  )

  return (
    <MasterListPage
      title="납품처"
      description="거래처의 납품처를 모아 봅니다. 배송센터 '확인 필요'·'권역 불일치'를 골라 한 번에 처리합니다. 납품처를 고치려면 코드를 눌러 거래처 화면으로 가세요."
      gridId="master-ship-tos"
      searchFields={searchFields}
      list={list}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      rowHref={customerHref}
      excelName={can.export ? '납품처' : undefined}
      bulkActions={
        can.update
          ? ({ ids, done }) => (
              <>
                {result && (
                  <span role="status" className="text-xs text-muted-foreground">
                    {result}
                  </span>
                )}
                <ShipToCenterDialog
                  ids={ids}
                  centers={centers}
                  trigger={
                    <Button type="button" disabled={ids.length === 0}>
                      <MapPinnedIcon />
                      배송센터 일괄 지정
                      {ids.length > 0 && ` (${ids.length})`}
                    </Button>
                  }
                  onDone={(r) => {
                    report(r)
                    done()
                  }}
                />
                {confirmButton(ids, done, 'auto')}
                {confirmButton(ids, done, 'renormalize')}
              </>
            )
          : undefined
      }
      emptyTitle="조건에 맞는 납품처가 없습니다"
    />
  )
}
