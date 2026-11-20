'use client'

import { useId, useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { CodeSelect } from '@/components/inputs/code-select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ConfirmDialogProps = {
  // 대화상자를 여는 버튼 (예: <Button>잔량 마감</Button>)
  trigger: React.ReactElement
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  // 삭제·마감처럼 되돌리기 어려운 작업이면 빨간 확인 버튼
  destructive?: boolean
  // 지정하면 사유 입력칸이 생기고, 사유를 적어야 확인할 수 있다 (잔량 마감, 재고 조정 등)
  // codeGroup을 주면 사유는 공통코드에서 고르고(필수), 글자 칸은 메모(선택)가 된다 (0087)
  reason?: { label: string; placeholder?: string; codeGroup?: string }
  // 확인 시 실행. 사유가 있으면 앞뒤 공백을 지운 사유(메모)와 고른 사유 코드를 받는다
  // 실패(예외)하면 대화상자를 연 채로 오류 메시지를 보여준다
  onConfirm: (reason?: string, reasonCode?: string) => void | Promise<void>
}

// 확인 대화상자: 되돌리기 어려운 작업 전에 한 번 더 묻는다
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  destructive = false,
  reason,
  onConfirm,
}: ConfirmDialogProps) {
  const reasonId = useId()
  const [open, setOpen] = useState(false)
  const [reasonText, setReasonText] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedReason = reasonText.trim()
  const canConfirm =
    !pending && (!reason || (reason.codeGroup ? reasonCode !== '' : trimmedReason.length > 0))

  // 닫힐 때 입력값·오류를 비워서 다음에 열 때 깨끗한 상태로 시작한다
  function handleOpenChange(next: boolean) {
    if (pending) return // 처리 중에는 닫지 않는다
    setOpen(next)
    if (!next) {
      setReasonText('')
      setReasonCode('')
      setError(null)
    }
  }

  async function handleConfirm() {
    if (!canConfirm) return
    setPending(true)
    setError(null)
    try {
      const text = reason ? trimmedReason : undefined
      // 사유 코드를 쓰는 경우에만 두 번째 값을 넘긴다
      await (reason?.codeGroup ? onConfirm(text, reasonCode) : onConfirm(text))
      setPending(false)
      handleOpenChange(false)
    } catch (e) {
      setPending(false)
      setError(e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>

        {reason?.codeGroup && (
          <div className="grid gap-2">
            <Label htmlFor={`${reasonId}-code`}>
              {reason.label} <span className="text-destructive">*</span>
            </Label>
            <CodeSelect
              id={`${reasonId}-code`}
              group={reason.codeGroup}
              value={reasonCode}
              onChange={setReasonCode}
              disabled={pending}
            />
          </div>
        )}
        {reason && (
          <div className="grid gap-2">
            <Label htmlFor={reasonId}>
              {reason.codeGroup ? (
                '메모'
              ) : (
                <>
                  {reason.label} <span className="text-destructive">*</span>
                </>
              )}
            </Label>
            <Textarea
              id={reasonId}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={reason.placeholder}
              disabled={pending}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          {/* 기본 Action 버튼은 누르는 즉시 닫히므로, 처리가 끝난 뒤 직접 닫는 일반 버튼을 쓴다 */}
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {pending ? '처리 중…' : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
