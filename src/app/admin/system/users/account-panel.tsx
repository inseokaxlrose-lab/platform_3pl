'use client'

import { KeyRoundIcon, PowerIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ConfirmDialog, FormRow, StatusBadge } from '@/components/common'
import { Can } from '@/components/permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { unwrap } from '@/lib/actions'
import { resetUserPasswordAction, setUserActiveAction } from './actions'

// 수정 화면의 계정 관리: 사용 중지/다시 사용, 비밀번호 초기화 (둘 다 기존 로그인을 끊는다)
export function AccountPanel({
  user,
}: {
  user: { id: string; username: string; isActive: boolean }
}) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function resetPassword(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await resetUserPasswordAction({ id: user.id, password, passwordConfirm })
      if (!result.ok) {
        const fieldMessage = Object.values(result.error.fieldErrors ?? {})[0]?.[0]
        setMessage({ ok: false, text: fieldMessage ?? result.error.message })
        return
      }
      setPassword('')
      setPasswordConfirm('')
      setMessage({
        ok: true,
        text: '비밀번호를 초기화했습니다. 사용자에게 새 비밀번호를 안전하게 전달하세요.',
      })
    })
  }

  return (
    <Can permission="system.users.update">
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-base font-semibold">계정 관리</h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            상태
            {user.isActive ? (
              <StatusBadge tone="success">사용</StatusBadge>
            ) : (
              <StatusBadge tone="danger">사용 중지</StatusBadge>
            )}
          </div>
          <ConfirmDialog
            trigger={
              <Button type="button" variant={user.isActive ? 'destructive' : 'outline'}>
                <PowerIcon />
                {user.isActive ? '사용 중지' : '다시 사용'}
              </Button>
            }
            title={user.isActive ? '이 계정을 사용 중지할까요?' : '이 계정을 다시 사용할까요?'}
            description={
              user.isActive
                ? `'${user.username}'은(는) 즉시 로그아웃되고 로그인할 수 없게 됩니다. 기록은 남습니다.`
                : `'${user.username}'이(가) 다시 로그인할 수 있게 됩니다.`
            }
            confirmLabel={user.isActive ? '사용 중지' : '다시 사용'}
            destructive={user.isActive}
            onConfirm={async () => {
              unwrap(await setUserActiveAction({ id: user.id, isActive: !user.isActive }))
              router.refresh()
            }}
          />
        </div>

        <form onSubmit={resetPassword} className="grid gap-4 border-t pt-4">
          {/* 새 비밀번호·확인은 한 줄에 2칸 */}
          <FormRow>
            <div className="grid gap-2">
              <Label htmlFor="reset-password">새 비밀번호</Label>
              <Input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="8자 이상"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reset-password-confirm">새 비밀번호 확인</Label>
              <Input
                id="reset-password-confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={pending}
              />
            </div>
          </FormRow>
          <Button
            type="submit"
            variant="outline"
            className="justify-self-start"
            disabled={pending || !password}
          >
            <KeyRoundIcon />
            비밀번호 초기화
          </Button>
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={message.ok ? 'text-sm text-success' : 'text-sm text-destructive'}
            >
              {message.text}
            </p>
          )}
        </form>
      </section>
    </Can>
  )
}
