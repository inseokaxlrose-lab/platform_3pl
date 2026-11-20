'use client'

import { BanIcon, CheckCheckIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { AdjustDetail } from '@/lib/stock/adjust-queries'
import { ADJUST_STATUS_LABELS, ADJUST_TYPE_LABELS } from '@/lib/stock/adjust-schema'
import { formatQty } from '@/lib/units/convert'
import { labelOf } from '@/lib/db-value'

type Line = AdjustDetail['lines'][number]

const qty = (value: string | null, unit: string, signed = false) =>
  value === null ? (
    <span className="text-muted-foreground">-</span>
  ) : (
    <span
      className={
        signed && value.startsWith('-')
          ? 'text-destructive tabular-nums'
          : signed && value !== '0'
            ? 'text-primary tabular-nums'
            : 'tabular-nums'
      }
    >
      {signed && !value.startsWith('-') && value !== '0' ? '+' : ''}
      {formatQty(value)} {unit}
    </span>
  )

// 실사·조정 상세 (0061): 줄별 등록 때 재고·지금 재고·센 수량·바뀔(바뀐) 수량, [확정]·[취소]
export function AdjustDetailPanel({
  adjust,
  canConfirm,
  canCancel,
  confirmAction,
  cancelAction,
}: {
  adjust: AdjustDetail
  canConfirm: boolean
  canCancel: boolean
  confirmAction: (input: { id: string }) => Promise<ActionResult<{ applied: number }>>
  cancelAction: (input: { id: string }) => Promise<ActionResult<unknown>>
}) {
  const router = useRouter()
  const isCount = adjust.type === 'COUNT'
  const draft = adjust.status === 'DRAFT'
  const columns: DataGridColumn<Line>[] = [
    { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56, pinned: true },
    { id: 'location', header: '로케이션', accessor: 'location', pinned: true },
    { id: 'item', header: '품목', accessor: 'item' },
    { id: 'shipper', header: '화주사', accessor: 'shipper' },
    { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
    { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
    {
      id: 'systemQty',
      header: '등록 때 재고',
      accessor: 'systemQty',
      align: 'right',
      cell: (r) => qty(r.systemQty, r.baseUnit),
    },
    ...(draft
      ? [
          {
            id: 'currentQty',
            header: '지금 재고',
            accessor: 'currentQty',
            align: 'right',
            cell: (r: Line) => qty(r.currentQty, r.baseUnit),
          } satisfies DataGridColumn<Line>,
        ]
      : []),
    ...(isCount
      ? [
          {
            id: 'countedQty',
            header: '센 수량',
            accessor: 'countedQty',
            align: 'right',
            cell: (r: Line) => qty(r.countedQty, r.baseUnit),
          } satisfies DataGridColumn<Line>,
        ]
      : []),
    {
      id: 'change',
      header: draft ? '바뀔 수량' : '바뀐 수량',
      accessor: (r) => (draft ? r.changeQty : r.appliedQty),
      align: 'right',
      cell: (r) => qty(draft ? r.changeQty : r.appliedQty, r.baseUnit, true),
    },
  ]

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex gap-3">
          <dt className="w-20 text-muted-foreground">유형</dt>
          <dd>{labelOf(ADJUST_TYPE_LABELS, adjust.type)}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 text-muted-foreground">센터</dt>
          <dd>{adjust.center}</dd>
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <dt className="w-20 text-muted-foreground">사유</dt>
          <dd>{adjust.reason}</dd>
        </div>
        {adjust.remark && (
          <div className="flex gap-3 sm:col-span-2">
            <dt className="w-20 text-muted-foreground">비고</dt>
            <dd className="whitespace-pre-wrap">{adjust.remark}</dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-20 text-muted-foreground">등록</dt>
          <dd>{adjust.createdBy}</dd>
        </div>
        {adjust.confirmedBy && (
          <div className="flex gap-3">
            <dt className="w-20 text-muted-foreground">확정</dt>
            <dd>{adjust.confirmedBy}</dd>
          </div>
        )}
        {adjust.canceledBy && (
          <div className="flex gap-3">
            <dt className="w-20 text-muted-foreground">취소</dt>
            <dd>{adjust.canceledBy}</dd>
          </div>
        )}
      </dl>

      {draft && isCount && (
        <p className="text-sm text-muted-foreground">
          실사는 확정할 때의 재고와 센 수량의 차이만큼 바뀝니다. 등록 뒤 재고가 바뀌었으면
          &quot;지금 재고&quot;로 다시 계산됩니다.
        </p>
      )}

      <LocalDataGrid
        id="stock-adjust-lines"
        columns={columns}
        rows={adjust.lines}
        getRowId={(r) => r.id}
      />

      {draft && (canConfirm || canCancel) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canCancel && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline">
                  <BanIcon />
                  취소
                </Button>
              }
              title="이 실사·조정을 취소할까요?"
              description="재고는 바뀌지 않습니다."
              confirmLabel="취소하기"
              destructive
              onConfirm={async () => {
                unwrap(await cancelAction({ id: adjust.id }))
                router.refresh()
              }}
            />
          )}
          {canConfirm && (
            <ConfirmDialog
              trigger={
                <Button type="button">
                  <CheckCheckIcon />
                  확정
                </Button>
              }
              title="확정하고 재고를 바꿀까요?"
              description="줄마다 '바뀔 수량'만큼 재고가 바뀌고 재고 이력에 남습니다. 되돌릴 수 없습니다."
              confirmLabel="확정"
              onConfirm={async () => {
                unwrap(await confirmAction({ id: adjust.id }))
                router.refresh()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function AdjustStatusBadge({ status }: { status: AdjustDetail['status'] }) {
  return (
    <StatusBadge
      tone={status === 'CONFIRMED' ? 'success' : status === 'CANCELED' ? 'neutral' : 'info'}
    >
      {labelOf(ADJUST_STATUS_LABELS, status)}
    </StatusBadge>
  )
}
