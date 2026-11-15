'use client'

import { RefreshCwIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { OPERATOR_STATUS, STATUSES_NEEDING_REASON } from '@/config/operator-codes'
import { changeOperatorStatusAction } from '../actions'

// 운영 상태 변경 팝업 (정의서 "상태변경 다이얼로그", 0040)
// 정지·해지는 사유 필수. 운영이 아니게 되면 그 운영사 사용자는 다음 화면부터 로그인이 막힌다
// 저장하면 화면을 새로 불러온다 (편집 폼도 새 버전으로 다시 그려진다)
export function OperatorStatusDialog({
  operatorId,
  rowVersion,
  status,
}: {
  operatorId: string
  rowVersion: number
  status: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState(status)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const needsReason = STATUSES_NEEDING_REASON.includes(next)

  const submit = () =>
    startTransition(async () => {
      const result = await changeOperatorStatusAction({
        id: operatorId,
        rowVersion,
        status: next,
        reason,
      })
      if (!result.ok) {
        setError(result.error.fieldErrors?.reason?.[0] ?? result.error.message)
        return
      }
      setOpen(false)
      router.refresh()
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        // 열 때마다 지금 상태에서 시작
        if (value) {
          setNext(status)
          setReason('')
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <RefreshCwIcon />
          상태 변경
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>운영 상태 변경</DialogTitle>
          <DialogDescription>
            운영중이 아니면 이 운영사의 사용자는 로그인할 수 없습니다. 정지·해지는 사유가
            필요합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="operator-status-next">상태</Label>
            <Select value={next} onValueChange={setNext} disabled={pending}>
              <SelectTrigger id="operator-status-next" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_STATUS.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsReason && (
            <div className="grid gap-2">
              <Label htmlFor="operator-status-reason">
                사유 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="operator-status-reason"
                rows={3}
                maxLength={200}
                value={reason}
                disabled={pending}
                aria-invalid={Boolean(error)}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            취소
          </Button>
          <Button type="button" onClick={submit} disabled={pending || next === status}>
            변경
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
