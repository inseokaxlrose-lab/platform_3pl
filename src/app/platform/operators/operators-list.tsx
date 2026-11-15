'use client'

import { LogInIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import { OPERATOR_STATUS_FORMAT } from '@/components/operator'
import { usePermission } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { OPERATOR_STATUS, OPERATOR_TYPE } from '@/config/operator-codes'
import { listOperatorsAction, switchOperatorAction } from './actions'

type Row = {
  id: string
  code: string
  name: string
  businessNumber: string
  ceoName: string | null
  phone: string | null
  status: string
  type: string
  plan: string
  contractEndOn: Date | null
  centerCount: number
  shipperCount: number
  userCount: number
  createdAt: Date
  updatedAt: Date
}

// 운영사 유형·요금제 서식 (상수 코드 → 이름)
const TYPE_FORMAT: StatusFormat = Object.fromEntries(
  OPERATOR_TYPE.options.map((o) => [o.value, { label: o.label, tone: 'neutral' as const }]),
)

// 검색 조건 (정의서 4장, 키는 서버 listOperatorsAction의 filters와 같게)
// 요금제·계약종료일·보세창고 조건은 2차 칸이라 2차 화면을 열 때 더한다
const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: 'keyword',
    label: '검색어',
    type: 'keyword',
    span: 4,
    placeholder: '운영사코드·운영사명',
  },
  { key: 'businessNumber', label: '사업자등록번호', type: 'bizNo', span: 3 },
  {
    key: 'status',
    label: '운영 상태',
    type: 'multi',
    span: 3,
    options: OPERATOR_STATUS.options,
  },
  {
    key: 'type',
    label: '운영사 유형',
    type: 'multi',
    span: 3,
    detail: true,
    options: OPERATOR_TYPE.options,
  },
  { key: 'createdAt', label: '등록일', type: 'dateRange', span: 6, detail: true },
]

// [이 운영사로 작업]: 전환 쿠키를 두고 운영사 화면으로 이동 (실패하면 버튼 옆에 이유)
function SwitchButton({ row }: { row: Row }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await switchOperatorAction({ id: row.id })
            if (!result.ok) {
              setError(result.error.message)
              return
            }
            router.push('/admin')
            router.refresh()
          })
        }
      >
        <LogInIcon />이 운영사로 작업
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

// 플랫폼 · 운영사 목록 (0039): 상태 변경은 4단계에서
export function OperatorsList({ actions }: { actions?: React.ReactNode }) {
  const { can } = usePermission()
  const list = useListQuery<Row>({
    gridId: 'platform-operators',
    fields: SEARCH_FIELDS,
    fetch: listOperatorsAction,
  })
  const columns: DataGridColumn<Row>[] = [
    {
      id: 'code',
      header: '운영사코드',
      accessor: 'code',
      sortable: true,
      hideable: false,
      pinned: true,
      href: (row) => `/platform/operators/${row.id}`,
    },
    {
      id: 'name',
      header: '운영사명',
      accessor: 'name',
      sortable: true,
      hideable: false,
      pinned: true,
    },
    { id: 'businessNumber', header: '사업자등록번호', accessor: 'businessNumber', format: 'bizNo' },
    { id: 'ceoName', header: '대표자', accessor: 'ceoName' },
    { id: 'phone', header: '대표전화', accessor: 'phone', format: 'phone' },
    {
      id: 'status',
      header: '운영 상태',
      accessor: 'status',
      sortable: true,
      format: { status: OPERATOR_STATUS_FORMAT },
    },
    {
      id: 'type',
      header: '운영사 유형',
      accessor: 'type',
      sortable: true,
      format: { status: TYPE_FORMAT },
    },
    { id: 'plan', header: '요금제', accessor: 'plan', sortable: true },
    {
      id: 'contractEndOn',
      header: '계약종료일',
      accessor: 'contractEndOn',
      format: 'date',
      sortable: true,
    },
    { id: 'centerCount', header: '센터 수', accessor: 'centerCount', format: 'number' },
    { id: 'shipperCount', header: '화주 수', accessor: 'shipperCount', format: 'number' },
    { id: 'createdAt', header: '등록일', accessor: 'createdAt', format: 'date', sortable: true },
    {
      id: 'updatedAt',
      header: '수정일',
      accessor: 'updatedAt',
      format: 'datetime',
      sortable: true,
      defaultHidden: true,
    },
    ...(can('platform.operators.switch')
      ? [
          {
            id: 'switch',
            header: '작업',
            accessor: 'id',
            hideable: false,
            cell: (row: Row) => <SwitchButton row={row} />,
          } satisfies DataGridColumn<Row>,
        ]
      : []),
  ]
  return (
    <MasterListPage
      title="운영사"
      description="플랫폼을 쓰는 운영사입니다. [이 운영사로 작업]을 누르면 그 운영사의 화면으로 들어가 대신 작업할 수 있습니다."
      actions={actions}
      gridId="platform-operators"
      rowHref={(row) => `/platform/operators/${row.id}`}
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={columns}
      getRowId={(row) => row.id}
      emptyTitle="등록된 운영사가 없습니다"
    />
  )
}
