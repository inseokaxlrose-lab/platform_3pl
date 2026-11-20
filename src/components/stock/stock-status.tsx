'use client'

import { useState, useTransition } from 'react'
import { StatusBadge, type StatusTone } from '@/components/common'
import { CodeSelect } from '@/components/inputs'
import { Field, FormGrid } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STOCK_STATUS } from '@/config/operator-codes'
import type { ActionResult } from '@/lib/actions'
import { labelOf } from '@/lib/db-value'
import type { StockStatusChangeInput } from '@/lib/stock/stock-status-schema'
import { formatQty } from '@/lib/units/convert'

// 재고상태 배지와 상태 변경 대화상자 (0088)

const TONES: Record<string, StatusTone> = {
  NORMAL: 'success',
  HOLD: 'warning',
  DAMAGED: 'danger',
  QUARANTINE: 'info',
}

export function StockStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={TONES[status] ?? 'neutral'}>
      {labelOf(STOCK_STATUS.labels, status)}
    </StatusBadge>
  )
}

export type StockStatusTarget = {
  id: string
  label: string
  status: string
  qty: string
  availableQty: string
  allocatedQty: string
  baseUnit: string
}

// 상태 변경: 바꿀 상태 · 수량(비우면 가용 전부) · 사유(정상이 아니면 필수, HOLD_REASON) · 메모
export function StockStatusDialog({
  target,
  onClose,
  onDone,
  action,
}: {
  // null이면 닫힌 상태
  target: StockStatusTarget | null
  onClose: () => void
  onDone: () => void
  action: (input: StockStatusChangeInput) => Promise<ActionResult<unknown>>
}) {
  const [toStatus, setToStatus] = useState('')
  const [qty, setQty] = useState('')
  const [reasonCd, setReasonCd] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function close() {
    setToStatus('')
    setQty('')
    setReasonCd('')
    setReason('')
    setErrors({})
    setMessage(null)
    onClose()
  }

  // 지금 상태가 정상이면 가용 수량까지, 아니면 (할당이 없으므로) 수량 전부
  const movable = target ? (target.status === 'NORMAL' ? target.availableQty : target.qty) : '0'
  const needsReason = toStatus !== '' && toStatus !== 'NORMAL'

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!target) return
    startTransition(async () => {
      const result = await action({
        stockId: target.id,
        toStatus: toStatus as StockStatusChangeInput['toStatus'],
        qty,
        reasonCd: needsReason ? reasonCd : '',
        reason,
      })
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(
          Object.keys(fieldErrors).length ? '입력값을 확인해 주세요.' : result.error.message,
        )
        return
      }
      close()
      onDone()
    })
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && close()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>재고상태 변경</DialogTitle>
            <DialogDescription>
              {target?.label} · 지금{' '}
              <span className="font-medium text-foreground">
                {target && labelOf(STOCK_STATUS.labels, target.status)}
              </span>{' '}
              {target && `${formatQty(target.qty)} ${target.baseUnit}`}
              {target && target.allocatedQty !== '0' && ` (할당 ${formatQty(target.allocatedQty)})`}
            </DialogDescription>
          </DialogHeader>
          <FormGrid>
            <Field
              label="바꿀 상태"
              span={6}
              required
              error={errors.toStatus}
              htmlFor="stock-status-to"
            >
              <Select value={toStatus} onValueChange={setToStatus} disabled={pending}>
                <SelectTrigger id="stock-status-to" className="w-full">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_STATUS.values
                    .filter((s) => s !== target?.status)
                    .map((s) => (
                      <SelectItem key={s} value={s}>
                        {labelOf(STOCK_STATUS.labels, s)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="수량"
              span={6}
              error={errors.qty}
              htmlFor="stock-status-qty"
              hint={`비우면 ${formatQty(movable)} ${target?.baseUnit ?? ''} 전부`}
            >
              <Input
                id="stock-status-qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={formatQty(movable)}
                disabled={pending}
                className="text-right"
              />
            </Field>
            <Field
              label="사유"
              span={6}
              required={needsReason}
              error={errors.reasonCd}
              htmlFor="stock-status-reason-cd"
              hint={needsReason ? undefined : '정상으로 되돌릴 때는 고르지 않아도 됩니다'}
            >
              <CodeSelect
                id="stock-status-reason-cd"
                group="HOLD_REASON"
                value={reasonCd}
                onChange={setReasonCd}
                disabled={pending || !needsReason}
                invalid={Boolean(errors.reasonCd)}
              />
            </Field>
            <Field label="메모" span={6} error={errors.reason} htmlFor="stock-status-reason">
              <Input
                id="stock-status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
              />
            </Field>
          </FormGrid>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending || !toStatus || (needsReason && !reasonCd)}>
              {pending ? '바꾸는 중…' : '상태 변경'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
