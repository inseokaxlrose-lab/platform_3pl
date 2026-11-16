'use client'

import { ArrowRightLeftIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { QtyInput, SearchSelect } from '@/components/inputs'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { PutawayWork } from '@/lib/inbound/putaway-queries'
import type { PutawayInput } from '@/lib/inbound/putaway-schema'
import { formatQty, parseQty } from '@/lib/units/convert'

type Pending = PutawayWork['pending'][number]
type History = PutawayWork['history'][number]
type Draft = { toLocationId: string; qty: string }

const qtyLabel = (value: string, unit: string) => `${formatQty(value)} ${unit}`
const safeQty = (text: string) => {
  try {
    return text ? parseQty(text) : 0n
  } catch {
    return 0n
  }
}

const HISTORY_COLUMNS: DataGridColumn<History>[] = [
  { id: 'createdAt', header: '적치 일시', accessor: 'createdAt', format: 'datetime', pinned: true },
  { id: 'receiptNo', header: '확정 번호', accessor: 'receiptNo' },
  { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56 },
  { id: 'item', header: '품목', accessor: 'item' },
  { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
  { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
  {
    id: 'qty',
    header: '적치 수량',
    accessor: 'qty',
    align: 'right',
    cell: (r) => qtyLabel(r.qty, r.baseUnit),
  },
  { id: 'toLocation', header: '로케이션', accessor: 'toLocation' },
  { id: 'createdBy', header: '작업자', accessor: 'createdBy' },
]

// 적치 (docs/decisions/0058): 입고확정 줄마다 보관 로케이션과 수량(기본은 남은 전부) → [적치 등록]
// 입고대기 창고의 재고가 고른 로케이션으로 옮겨진다
export function PutawayPanel({
  work,
  canConfirm,
  putawayAction,
}: {
  work: PutawayWork
  canConfirm: boolean
  putawayAction: (input: PutawayInput) => Promise<ActionResult<{ count: number }>>
}) {
  const router = useRouter()
  const initial = () =>
    Object.fromEntries(work.pending.map((p) => [p.id, { toLocationId: '', qty: p.availableQty }]))
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial)
  // 새로 불러와 남은 수량이 바뀌면 입력을 다시 채운다 (그리는 중에 맞추는 React 권장 방식)
  const pendingKey = work.pending.map((p) => `${p.id}:${p.availableQty}`).join(',')
  const [seenKey, setSeenKey] = useState(pendingKey)
  if (seenKey !== pendingKey) {
    setSeenKey(pendingKey)
    setDrafts(initial())
  }
  const [message, setMessage] = useState<string | null>(null)
  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))

  const locationOptions = work.locations.map((l) => ({
    value: l.id,
    label: l.label,
    description: l.description,
  }))
  // 로케이션을 고르고 수량이 0보다 큰 줄만 적치한다
  const chosen = work.pending.filter(
    (p) => drafts[p.id]?.toLocationId && safeQty(drafts[p.id]?.qty ?? '') > 0n,
  )
  const tooMuch = chosen.filter((p) => safeQty(drafts[p.id].qty) > parseQty(p.availableQty))

  const columns: DataGridColumn<Pending>[] = [
    { id: 'receiptNo', header: '확정 번호', accessor: 'receiptNo', pinned: true },
    { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56 },
    { id: 'item', header: '품목', accessor: 'item' },
    { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
    { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
    {
      id: 'availableQty',
      header: '적치 가능',
      accessor: 'availableQty',
      align: 'right',
      cell: (r) => qtyLabel(r.availableQty, r.baseUnit),
    },
    {
      id: 'toLocation',
      header: '보낼 로케이션',
      accessor: (r) => drafts[r.id]?.toLocationId ?? '',
      width: 240,
      hideable: false,
      cell: (r) => (
        <div className="w-56">
          <SearchSelect
            id={`putaway-location-${r.id}`}
            options={locationOptions}
            value={drafts[r.id]?.toLocationId ?? ''}
            onChange={(toLocationId) => set(r.id, { toLocationId })}
            placeholder="로케이션 선택"
            searchPlaceholder="창고·로케이션 코드"
            disabled={!canConfirm}
          />
        </div>
      ),
    },
    {
      id: 'qty',
      header: '적치 수량',
      accessor: (r) => drafts[r.id]?.qty ?? '',
      width: 170,
      hideable: false,
      cell: (r) => (
        <div className="w-36">
          <QtyInput
            aria-label={`${r.receiptNo} ${r.lineNo}번 줄 적치 수량`}
            value={drafts[r.id]?.qty ?? ''}
            onChange={(qty) => set(r.id, { qty })}
            decimals={r.decimals}
            unit={r.baseUnit}
            disabled={!canConfirm}
            aria-invalid={safeQty(drafts[r.id]?.qty ?? '') > parseQty(r.availableQty)}
          />
        </div>
      ),
    },
  ]

  const submit = async () => {
    setMessage(null)
    const saved = unwrap(
      await putawayAction({
        asnId: work.id,
        lines: chosen.map((p) => ({
          receiptLineId: p.id,
          toLocationId: drafts[p.id].toLocationId,
          qty: drafts[p.id].qty,
        })),
      }),
    )
    setMessage(`${saved.count}건을 적치했습니다.`)
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">적치할 재고</h2>
        <p className="text-sm text-muted-foreground">
          입고 확정으로 입고대기 창고에 있는 재고입니다. 줄마다 보관 로케이션을 고르고 수량을
          넣습니다 (기본은 남은 전부, 나눠서 여러 번 적치할 수 있습니다).
        </p>
        {work.locations.length === 0 && (
          <p role="alert" className="text-sm text-destructive">
            이 센터에 사용 중인 보관 로케이션이 없습니다. 창고·로케이션을 먼저 등록해 주세요.
          </p>
        )}
        <LocalDataGrid
          id="inbound-putaway-pending"
          columns={columns}
          rows={work.pending}
          getRowId={(r) => r.id}
          empty={{
            title: '적치할 재고가 없습니다',
            description: '입고 확정한 재고를 모두 적치했거나 아직 확정이 없습니다.',
          }}
        />
        {canConfirm && work.pending.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {tooMuch.length > 0 && (
              <p role="alert" className="mr-auto text-sm text-destructive">
                적치할 수 있는 수량보다 많은 줄이 있습니다.
              </p>
            )}
            {message && (
              <p role="status" className="mr-auto text-sm text-primary">
                {message}
              </p>
            )}
            <ConfirmDialog
              trigger={
                <Button type="button" disabled={chosen.length === 0 || tooMuch.length > 0}>
                  <ArrowRightLeftIcon />
                  적치 등록{chosen.length > 0 ? ` (${chosen.length}건)` : ''}
                </Button>
              }
              title="적치를 등록할까요?"
              description="입고대기 창고의 재고가 고른 로케이션으로 옮겨집니다."
              confirmLabel="적치 등록"
              onConfirm={submit}
            />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">적치 기록</h2>
        <LocalDataGrid
          id="inbound-putaway-history"
          columns={HISTORY_COLUMNS}
          rows={work.history}
          getRowId={(r) => r.id}
          empty={{ title: '아직 적치 기록이 없습니다' }}
        />
      </section>
    </div>
  )
}
