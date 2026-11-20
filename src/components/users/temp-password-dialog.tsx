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

// 임시 비밀번호 1회 표시 (0086, API 키 발급 팝업 0081과 같은 모양)
// - [복사] 버튼, "이 창을 닫으면 다시 볼 수 없습니다" 경고
// - "전달할 곳에 적어 두었습니다"에 체크해야 닫을 수 있다 (바깥 누르기·Esc로도 닫히지 않음)
export function TempPasswordDialog({
  username,
  password,
  onClose,
}: {
  username: string
  // null이면 닫힌 상태
  password: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function copy() {
    if (!password) return
    try {
      await navigator.clipboard.writeText(password)
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
    <Dialog open={password !== null} onOpenChange={(open) => !open && confirmed && close()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => !confirmed && e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>임시 비밀번호</DialogTitle>
          <DialogDescription>
            아이디 <span className="font-medium text-foreground">{username}</span>의 임시
            비밀번호입니다. 사용자에게 전달하세요. 처음 로그인하면 새 비밀번호로 바꿔야 합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <code
              data-testid="temp-password"
              className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-base tracking-wider break-all select-all"
            >
              {password}
            </code>
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? '복사됨' : '복사'}
            </Button>
          </div>
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />이 창을 닫으면 다시 볼 수
            없습니다. 잃어버리면 [비밀번호 초기화]로 새로 만드세요.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="temp-password-confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor="temp-password-confirm" className="font-normal">
              임시 비밀번호를 전달할 곳에 적어 두었습니다
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
