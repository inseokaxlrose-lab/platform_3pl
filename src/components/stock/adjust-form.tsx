'use client'

import { CodeSelect } from '@/components/inputs'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { QtyInput, SearchSelect } from '@/components/inputs'
import {
  EditableSubTable,
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormHeader,
  type MasterFormSection,
} from '@/components/master-form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ActionResult } from '@/lib/actions/result'
import type { AdjustStockOption } from '@/lib/stock/adjust-queries'
import {
  ADJUST_TYPE_LABELS,
  adjustSchema,
  MAX_ADJUST_LINES,
  type AdjustInput,
} from '@/lib/stock/adjust-schema'
import { formatQty, parseQty, qtyText } from '@/lib/units/convert'

type Line = AdjustInput['lines'][number]
const EMPTY_LINE: Line = { stockId: '', qty: '' }

// 실사 차이 미리보기: 센 수량 − 지금 재고
function diffText(counted: string, current: string) {
  try {
    const diff = parseQty(counted) - parseQty(current)
    return diff === 0n ? '차이 없음' : `${diff > 0n ? '+' : ''}${formatQty(qtyText(diff))}`
  } catch {
    return null
  }
}

// 재고 실사·조정 등록 (docs/decisions/0061, 입력 화면 틀 0031)
// 실사: 재고 줄마다 센 수량 / 조정: 바꿀 수량(±). 등록만으로는 재고가 바뀌지 않고, 관리자가 확정하면 바뀐다
export function AdjustForm({
  header,
  centers,
  loadStocks,
  createAction,
}: {
  header: MasterFormHeader
  centers: { id: string; code: string; name: string }[]
  loadStocks: (input: { centerId: string }) => Promise<ActionResult<AdjustStockOption[]>>
  createAction: (input: AdjustInput) => Promise<ActionResult<{ id: string }>>
}) {
  const router = useRouter()
  const form = useMasterForm({
    initial: {
      type: 'COUNT',
      centerId: centers.length === 1 ? centers[0].id : '',
      reasonCd: '',
      reason: '',
      remark: '',
      lines: [{ ...EMPTY_LINE }],
    } as AdjustInput,
    schema: adjustSchema,
    save: (value: AdjustInput) => createAction(value),
    onSuccess: (created) => router.push(`/admin/stock/adjustments/${created.id}`),
  })
  const { value, set, errors } = form
  const disabled = form.pending

  // 센터의 재고 줄 (센터가 바뀌면 다시 불러온다)
  const [stocks, setStocks] = useState<AdjustStockOption[]>([])
  const [loadedFor, setLoadedFor] = useState('')
  useEffect(() => {
    if (!value.centerId || value.centerId === loadedFor) return
    let cancelled = false
    loadStocks({ centerId: value.centerId }).then((result) => {
      if (cancelled) return
      setStocks(result.ok ? result.data : [])
      setLoadedFor(value.centerId)
    })
    return () => {
      cancelled = true
    }
  }, [loadStocks, value.centerId, loadedFor])
  const stockById = useMemo(() => new Map(stocks.map((s) => [s.id, s])), [stocks])
  const stockOptions = useMemo(
    () =>
      stocks.map((s) => ({
        value: s.id,
        label: s.label,
        description: s.description,
        keywords: s.keywords,
      })),
    [stocks],
  )
  const isCount = value.type === 'COUNT'

  const sections: MasterFormSection[] = [
    {
      id: 'basic',
      title: '기본 정보',
      content: (
        <FormGrid>
          <Field label="유형" span={3} required htmlFor="adjust-type">
            <Select
              value={value.type}
              onValueChange={(type) => set({ type: type as AdjustInput['type'] })}
              disabled={disabled}
            >
              <SelectTrigger id="adjust-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['COUNT', 'ADJUST'] as const).map((type) => (
                  <SelectItem key={type} value={type}>
                    {ADJUST_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="센터" span={5} required error={errors.centerId} htmlFor="adjust-center">
            <Select
              value={value.centerId}
              onValueChange={(centerId) => set({ centerId, lines: [{ ...EMPTY_LINE }] })}
              disabled={disabled}
            >
              <SelectTrigger
                id="adjust-center"
                className="w-full"
                aria-invalid={Boolean(errors.centerId)}
              >
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {centers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="사유"
            span={4}
            required
            error={errors.reasonCd}
            htmlFor="adjust-reason-cd"
            hint="공통코드 '재고 조정 사유'에서 고릅니다"
          >
            <CodeSelect
              id="adjust-reason-cd"
              group="ADJUST_REASON"
              value={value.reasonCd}
              onChange={(reasonCd) => set({ reasonCd })}
              disabled={disabled}
              invalid={Boolean(errors.reasonCd)}
            />
          </Field>
          <Field
            label="사유 메모"
            span={8}
            error={errors.reason}
            htmlFor="adjust-reason"
            hint="예: 3월 정기 실사 / A-01-01 랙 파손"
          >
            <Input
              id="adjust-reason"
              value={value.reason}
              onChange={(e) => set({ reason: e.target.value })}
              disabled={disabled}
              aria-invalid={Boolean(errors.reason)}
            />
          </Field>
          <Field label="비고" span={12} error={errors.remark} htmlFor="adjust-remark">
            <Textarea
              id="adjust-remark"
              rows={2}
              value={value.remark}
              onChange={(e) => set({ remark: e.target.value })}
              disabled={disabled}
            />
          </Field>
        </FormGrid>
      ),
    },
    {
      id: 'lines',
      title: isCount ? '실사 수량' : '조정 수량',
      description: isCount
        ? '재고 줄마다 실제로 센 수량을 넣습니다 (기본단위). 확정할 때 그때 재고와의 차이만큼 바뀝니다.'
        : '재고 줄마다 늘릴 수량(+) 또는 줄일 수량(−)을 넣습니다 (기본단위).',
      content: (
        <EditableSubTable<Line>
          name="lines"
          rows={value.lines}
          onChange={(lines) => set({ lines })}
          createRow={() => ({ ...EMPTY_LINE })}
          maxRows={MAX_ADJUST_LINES}
          minRows={1}
          errors={errors}
          addLabel="줄 추가"
          countUnit="줄"
          disabled={disabled || !value.centerId}
          columns={[
            {
              key: 'stockId',
              label: '재고 (로케이션 · 품목)',
              required: true,
              width: 'minmax(16rem,2fr)',
              render: ({ row, id, invalid, disabled: cellDisabled, onChange }) => (
                <SearchSelect
                  id={id}
                  options={stockOptions}
                  value={row.stockId}
                  onChange={onChange}
                  invalid={invalid}
                  disabled={cellDisabled}
                  placeholder="재고 선택"
                  searchPlaceholder="로케이션·품목·로트"
                />
              ),
            },
            {
              key: 'qty',
              label: isCount ? '센 수량' : '바꿀 수량(±)',
              required: true,
              width: '10rem',
              render: ({ row, id, invalid, disabled: cellDisabled, onChange }) => {
                const stock = stockById.get(row.stockId)
                const diff = isCount && stock && row.qty ? diffText(row.qty, stock.qty) : null
                return (
                  <div>
                    <QtyInput
                      id={id}
                      value={row.qty}
                      onChange={onChange}
                      decimals={stock?.decimals ?? 0}
                      allowNegative={!isCount}
                      unit={stock?.baseUnit}
                      aria-invalid={invalid}
                      disabled={cellDisabled}
                    />
                    {stock && (
                      <p className="mt-1 text-right text-xs text-muted-foreground">
                        재고 {formatQty(stock.qty)}
                        {diff ? ` · ${diff}` : ''}
                      </p>
                    )}
                  </div>
                )
              },
            },
          ]}
        />
      ),
    },
  ]

  return <MasterFormPage header={header} form={form} readOnly={false} sections={sections} />
}
