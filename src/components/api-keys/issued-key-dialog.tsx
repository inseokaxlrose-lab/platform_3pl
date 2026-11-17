'use client'

import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

// 발급 완료 팝업 (0081): 키 원문을 한 번만 보여 준다
// - [복사] 버튼, "이 창을 닫으면 다시 볼 수 없습니다" 경고
// - "복사했습니다"에 체크해야 닫을 수 있다 (바깥 누르기·Esc로도 닫히지 않음)
export function IssuedKeyDialog({
  fullKey,
  onClose,
}: {
  // null이면 닫힌 상태
  fullKey: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function copy() {
    if (!fullKey) return
    try {
      await navigator.clipboard.writeText(fullKey)
      setCopied(true)
    } catch {
      // 클립보드를 못 쓰는 환경: 글자를 직접 골라 복사한다
      setCopied(false)
    }
  }

  function close() {
    setCopied(false)
    setConfirmed(false)
    onClose()
  }

  return (
    <Dialog open={fullKey !== null} onOpenChange={(open) => !open && confirmed && close()}>
      <DialogContent
        className="sm:max-w-xl"
        showCloseButton={false}
        onEscapeKeyDown={(e) => !confirmed && e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>API 키를 발급했습니다</DialogTitle>
          <DialogDescription>
            아래 키를 화주 개발 담당자에게 안전하게 전달하세요. 메일 본문·메신저에 그대로 붙이지
            마세요.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <code
              data-testid="issued-api-key"
              className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm break-all select-all"
            >
              {fullKey}
            </code>
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? '복사됨' : '복사'}
            </Button>
          </div>
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />이 창을 닫으면 키를 다시 볼 수
            없습니다. 잃어버리면 이 키를 폐기하고 새로 발급해야 합니다.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="issued-key-confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor="issued-key-confirm" className="font-normal">
              키를 복사해 안전한 곳에 보관했습니다
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={close} disabled={!confirmed}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
