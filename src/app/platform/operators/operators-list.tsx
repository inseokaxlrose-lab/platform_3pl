'use client'

import { LogInIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { DataGridColumn, StatusFormat } from '@/components/data-grid'
import { MasterListPage, type SearchFieldDef, useListQuery } from '@/components/master-list'
import { usePermission } from '@/components/permission'
import { Button } from '@/components/ui/button'
import {
  OPERATOR_STATUS_LABELS,
  OPERATOR_STATUSES,
  type OperatorStatus,
} from '@/lib/operator/operator-status'
import { listOperatorsAction, switchOperatorAction } from './actions'

type Row = {
  id: string
  name: string
  businessNumber: string
  status: string
  userCount: number
  createdAt: Date
}

// 상태 배지 색: 운영 = 초록, 대기 = 파랑, 정지 = 주황, 해지 = 빨강
const TONES: Record<OperatorStatus, StatusFormat[string]['tone']> = {
  PENDING: 'info',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
}
const STATUS_FORMAT: StatusFormat = Object.fromEntries(
  OPERATOR_STATUSES.map((s) => [s, { label: OPERATOR_STATUS_LABELS[s], tone: TONES[s] }]),
)

// 검색 조건 (키는 서버 listOperatorsAction의 filters와 같게)
const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: 'keyword',
    label: '검색어',
    type: 'keyword',
    span: 4,
    placeholder: '운영사명·사업자등록번호',
  },
  {
    key: 'status',
    label: '상태',
    type: 'segment',
    span: 6,
    options: OPERATOR_STATUSES.map((s) => ({ value: s, label: OPERATOR_STATUS_LABELS[s] })),
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
      id: 'name',
      header: '운영사명',
      accessor: 'name',
      sortable: true,
      hideable: false,
      pinned: true,
    },
    { id: 'businessNumber', header: '사업자등록번호', accessor: 'businessNumber', format: 'bizNo' },
    {
      id: 'status',
      header: '상태',
      accessor: 'status',
      sortable: true,
      format: { status: STATUS_FORMAT },
    },
    { id: 'userCount', header: '사용자 수', accessor: 'userCount', format: 'number' },
    { id: 'createdAt', header: '등록일', accessor: 'createdAt', format: 'date', sortable: true },
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
      searchFields={SEARCH_FIELDS}
      list={list}
      columns={columns}
      getRowId={(row) => row.id}
      emptyTitle="등록된 운영사가 없습니다"
    />
  )
}
