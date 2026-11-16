'use client'

import { ArrowRightLeftIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { DateInput } from '@/components/inputs'
import { Field, FormGrid } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CENTER_STATUS, CENTER_STATUSES_NEEDING_REASON } from '@/lib/centers/center-status'
import { changeCenterStatusAction } from './actions'

// 상태마다 바꾸면 생기는 일 (팝업 안내)
const EFFECT: Record<string, string> = {
  PREPARING: '창고·로케이션·이용 화주사를 준비할 수 있고, 입고 등 새 업무는 받지 않습니다.',
  ACTIVE: '모든 업무를 할 수 있습니다.',
  SUSPENDED: '새 업무와 설정 변경을 막습니다. 소속 직원은 계속 데이터를 볼 수 있습니다.',
  CLOSED:
    '운영을 끝냅니다. 소속 직원의 데이터 범위에서 빠지고, 재고가 남았거나 끝나지 않은 입고가 있으면 폐쇄할 수 없습니다.',
}

// 센터 운영 상태 변경 팝업 (0073): 일시중지·폐쇄는 사유, 폐쇄는 운영 종료일 필수
export function CenterStatusDialog({
  center,
  onChanged,
}: {
  center: { id: string; status: string; rowVersion: number }
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [closedOn, setClosedOn] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // 열 때마다 비우고 시작
  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setStatus('')
      setReason('')
      setClosedOn(new Date().toISOString().slice(0, 10))
      setErrors({})
      setMessage(null)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await changeCenterStatusAction({
        id: center.id,
        rowVersion: center.rowVersion,
        status,
        reason,
        closedOn: status === 'CLOSED' ? closedOn : '',
      })
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(Object.keys(fieldErrors).length > 0 ? null : result.error.message)
        return
      }
      setOpen(false)
      onChanged()
    })
  }

  const needsReason = CENTER_STATUSES_NEEDING_REASON.includes(status)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ArrowRightLeftIcon />
          상태 변경
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>운영 상태 변경</DialogTitle>
            <DialogDescription>
              지금 상태: {CENTER_STATUS.labels[center.status as keyof typeof CENTER_STATUS.labels]}
            </DialogDescription>
          </DialogHeader>
          <FormGrid>
            <Field
              span={12}
              label="바꿀 상태"
              required
              htmlFor="center-status"
              error={errors.status}
            >
              <Select value={status} onValueChange={setStatus} disabled={pending}>
                <SelectTrigger id="center-status" className="w-full">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {CENTER_STATUS.options
                    .filter((o) => o.value !== center.status)
                    .map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            {status && (
              <p className="col-span-12 text-sm text-muted-foreground">{EFFECT[status]}</p>
            )}
            {needsReason && (
              <Field
                span={12}
                label="사유"
                required
                htmlFor="center-status-reason"
                error={errors.reason}
              >
                <Input
                  id="center-status-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                  disabled={pending}
                />
              </Field>
            )}
            {status === 'CLOSED' && (
              <Field
                span={6}
                label="운영 종료일"
                required
                htmlFor="center-status-closed-on"
                error={errors.closedOn}
              >
                <DateInput
                  id="center-status-closed-on"
                  value={closedOn}
                  onChange={setClosedOn}
                  disabled={pending}
                />
              </Field>
            )}
          </FormGrid>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              type="submit"
              variant={status === 'CLOSED' ? 'destructive' : 'default'}
              disabled={pending || !status}
            >
              {pending ? '바꾸는 중…' : '바꾸기'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
