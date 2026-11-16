'use client'

import { CheckCheckIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/common'
import { LocalDataGrid, type DataGridColumn } from '@/components/data-grid'
import { QtyInput } from '@/components/inputs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { ConfirmWork } from '@/lib/inbound/receipt-queries'
import type { ReceiptInput } from '@/lib/inbound/receipt-schema'
import { formatQty, parseQty, qtyText } from '@/lib/units/convert'

type Inspection = ConfirmWork['inspections'][number]
type ReceiptRow = ConfirmWork['receipts'][number]

const qtyLabel = (value: string, unit: string) => `${formatQty(value)} ${unit}`

// 수량 글자 → 고정 소수점 (잘못된 글자는 0)
const safeQty = (text: string) => {
  try {
    return text ? parseQty(text) : 0n
  } catch {
    return 0n
  }
}

const RECEIPT_COLUMNS: DataGridColumn<ReceiptRow>[] = [
  { id: 'receiptNo', header: '확정 번호', accessor: 'receiptNo', pinned: true },
  { id: 'confirmedAt', header: '확정 일시', accessor: 'confirmedAt', format: 'datetime' },
  { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56 },
  { id: 'item', header: '품목', accessor: 'item' },
  { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
  { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
  {
    id: 'qty',
    header: '확정 수량',
    accessor: 'qty',
    align: 'right',
    cell: (r) => qtyLabel(r.qty, r.baseUnit),
  },
  {
    id: 'putawayQty',
    header: '적치',
    accessor: 'putawayQty',
    align: 'right',
    cell: (r) => qtyLabel(r.putawayQty, r.baseUnit),
  },
  { id: 'confirmedBy', header: '확정자', accessor: 'confirmedBy' },
]

// 입고 확정 (docs/decisions/0057): 검수 기록마다 확정할 수량(기본은 남은 전부) → [입고 확정]
// 예정보다 많아지면 "초과 입고" 확인을 받는다. 확정하면 입고대기 창고에 재고가 생긴다
export function ConfirmPanel({
  work,
  canConfirm,
  confirmAction,
}: {
  work: ConfirmWork
  canConfirm: boolean
  confirmAction: (input: ReceiptInput) => Promise<ActionResult<{ receiptNo: string }>>
}) {
  const router = useRouter()
  const closed = work.status === 'CLOSED'
  const [qtys, setQtys] = useState<Record<string, string>>(() =>
    Object.fromEntries(work.inspections.map((i) => [i.id, i.availableQty])),
  )
  // 확정 뒤 새로 불러오면 남은 수량이 바뀐다 → 입력칸을 남은 수량으로 다시 채운다
  // (그리는 중에 바뀐 것을 알아채고 바로 맞춘다 — 효과(useEffect)로 한 번 더 그리지 않는 React 권장 방식)
  const availableKey = work.inspections.map((i) => `${i.id}:${i.availableQty}`).join(',')
  const [seenKey, setSeenKey] = useState(availableKey)
  if (seenKey !== availableKey) {
    setSeenKey(availableKey)
    setQtys(Object.fromEntries(work.inspections.map((i) => [i.id, i.availableQty])))
  }
  const [remark, setRemark] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const chosen = work.inspections.filter((i) => safeQty(qtys[i.id] ?? '') > 0n)
  const tooMuch = chosen.filter((i) => safeQty(qtys[i.id]) > parseQty(i.availableQty))

  // 줄별 초과: 지금까지 확정 + 이번 확정 > 예정
  const overLines = useMemo(() => {
    const adding = new Map<string, bigint>()
    for (const i of chosen) {
      adding.set(i.asnLineId, (adding.get(i.asnLineId) ?? 0n) + safeQty(qtys[i.id]))
    }
    return work.lines
      .map((l) => {
        const after = parseQty(l.confirmedQty) + (adding.get(l.id) ?? 0n)
        const over = after - parseQty(l.expectedQty)
        return { lineNo: l.lineNo, over }
      })
      .filter((l) => l.over > 0n)
  }, [chosen, qtys, work.lines])

  const columns: DataGridColumn<Inspection>[] = [
    { id: 'lineNo', header: '줄', accessor: 'lineNo', format: 'number', width: 56, pinned: true },
    { id: 'item', header: '품목', accessor: 'item', pinned: true },
    { id: 'lotNo', header: '로트번호', accessor: 'lotNo' },
    { id: 'expiryOn', header: '유통기한', accessor: 'expiryOn', format: 'date' },
    {
      id: 'inspectedQty',
      header: '검수(정상)',
      accessor: 'inspectedQty',
      align: 'right',
      cell: (r) => qtyLabel(r.inspectedQty, r.baseUnit),
    },
    {
      id: 'confirmedQty',
      header: '확정됨',
      accessor: 'confirmedQty',
      align: 'right',
      cell: (r) => qtyLabel(r.confirmedQty, r.baseUnit),
    },
    {
      id: 'qty',
      header: '이번 확정',
      accessor: (r) => qtys[r.id] ?? '',
      width: 170,
      hideable: false,
      cell: (r) => (
        <div className="w-36">
          <QtyInput
            aria-label={`${r.lineNo}번 줄 확정 수량`}
            value={qtys[r.id] ?? ''}
            onChange={(value) => setQtys((current) => ({ ...current, [r.id]: value }))}
            decimals={r.decimals}
            unit={r.baseUnit}
            disabled={!canConfirm || closed}
            aria-invalid={safeQty(qtys[r.id] ?? '') > parseQty(r.availableQty)}
          />
        </div>
      ),
    },
  ]

  const submit = async () => {
    setMessage(null)
    const result = await confirmAction({
      asnId: work.id,
      lines: chosen.map((i) => ({ inspectionId: i.id, qty: qtys[i.id] })),
      remark,
    })
    const saved = unwrap(result)
    setMessage(`${saved.receiptNo}로 확정했습니다. 입고대기 창고에 재고가 생겼습니다.`)
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">확정할 검수</h2>
        <p className="text-sm text-muted-foreground">
          검수한 정상 수량 중 이번에 확정할 수량을 넣습니다 (기본단위, 기본은 남은 전부). 0이면
          이번에 확정하지 않습니다.
        </p>
        <LocalDataGrid
          id="inbound-confirm-inspections"
          columns={columns}
          rows={work.inspections}
          getRowId={(r) => r.id}
          empty={{
            title: '확정할 검수가 없습니다',
            description: '검수한 수량을 모두 확정했거나 아직 검수가 없습니다.',
          }}
        />
        {canConfirm && !closed && work.inspections.length > 0 && (
          <div className="flex flex-wrap items-end justify-end gap-3">
            <div className="mr-auto w-full max-w-md space-y-1">
              <Label htmlFor="receipt-remark">비고</Label>
              <Input
                id="receipt-remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="선택"
              />
            </div>
            {tooMuch.length > 0 && (
              <p role="alert" className="text-sm text-destructive">
                확정할 수 있는 수량보다 많은 줄이 있습니다.
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-primary">
                {message}
              </p>
            )}
            <ConfirmDialog
              trigger={
                <Button type="button" disabled={chosen.length === 0 || tooMuch.length > 0}>
                  <CheckCheckIcon />
                  입고 확정{chosen.length > 0 ? ` (${chosen.length}건)` : ''}
                </Button>
              }
              title={overLines.length > 0 ? '초과 입고를 확정할까요?' : '입고를 확정할까요?'}
              description={
                overLines.length > 0
                  ? `예정보다 많이 받습니다: ${overLines
                      .map((l) => `${l.lineNo}번 줄 +${formatQty(qtyText(l.over))}`)
                      .join(', ')}. 초과분까지 재고가 됩니다.`
                  : '확정한 수량만큼 입고대기 창고에 재고가 생깁니다. 확정은 되돌릴 수 없습니다.'
              }
              confirmLabel="입고 확정"
              destructive={overLines.length > 0}
              onConfirm={submit}
            />
          </div>
        )}
        {closed && (
          <p className="text-sm text-muted-foreground">마감된 ASN은 더 확정할 수 없습니다.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">입고 확정 이력</h2>
        <LocalDataGrid
          id="inbound-confirm-receipts"
          columns={RECEIPT_COLUMNS}
          rows={work.receipts}
          getRowId={(r) => r.id}
          empty={{ title: '아직 확정한 입고가 없습니다' }}
        />
      </section>
    </div>
  )
}
