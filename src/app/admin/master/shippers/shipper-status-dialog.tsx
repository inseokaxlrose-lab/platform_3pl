'use client'

import { ArrowRightLeftIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
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
import { SHIPPER_STATUS, SHIPPER_STATUSES_NEEDING_REASON } from '@/lib/shippers/shipper-codes'
import { changeShipperStatusAction } from './actions'

// 상태마다 바꾸면 생기는 일 (팝업 안내, 정의서 "상태별 동작")
const EFFECT: Record<string, string> = {
  PREPARING:
    '품목·거래처·포털 사용자를 준비할 수 있고, 입고(ASN) 등 새 업무는 받지 않습니다. 포털 로그인은 됩니다.',
  ACTIVE: '모든 업무를 할 수 있습니다.',
  SUSPENDED:
    '새 입고와 품목·거래처 등록을 막습니다. 포털 사용자는 조회만 할 수 있고, 진행 중인 입고는 계속 처리합니다.',
  TERMINATED:
    '계약을 끝냅니다. 포털 사용자는 로그인할 수 없고, 재고가 남았거나 끝나지 않은 입고가 있으면 해지할 수 없습니다.',
}

// 화주사 상태 변경 팝업 (0080): 일시정지·해지는 사유 필수
export function ShipperStatusDialog({
  shipper,
}: {
  shipper: { id: string; status: string; rowVersion: number }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // 열 때마다 비우고 시작
  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setStatus('')
      setReason('')
      setErrors({})
      setMessage(null)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await changeShipperStatusAction({
        id: shipper.id,
        rowVersion: shipper.rowVersion,
        status,
        reason,
      })
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
        setMessage(Object.keys(fieldErrors).length > 0 ? null : result.error.message)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  const needsReason = SHIPPER_STATUSES_NEEDING_REASON.includes(status)
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
            <DialogTitle>화주사 상태 변경</DialogTitle>
            <DialogDescription>
              지금 상태:{' '}
              {SHIPPER_STATUS.labels[shipper.status as keyof typeof SHIPPER_STATUS.labels]}
            </DialogDescription>
          </DialogHeader>
          <FormGrid>
            <Field
              span={12}
              label="바꿀 상태"
              required
              htmlFor="shipper-status"
              error={errors.status}
            >
              <Select value={status} onValueChange={setStatus} disabled={pending}>
                <SelectTrigger id="shipper-status" className="w-full">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {SHIPPER_STATUS.options
                    .filter((o) => o.value !== shipper.status)
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
                htmlFor="shipper-status-reason"
                error={errors.reason}
              >
                <Input
                  id="shipper-status-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
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
              variant={status === 'TERMINATED' ? 'destructive' : 'default'}
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
